// src/components/LessonStudio.tsx
import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from 'react-query';
import { Button } from '@/components/ui/button';

export const LessonStudio = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [processingState, setProcessingState] = useState<'idle' | 'loading' | 'processing' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const queryClient = useQueryClient();

  const processVideoMutation = useMutation(
    async (frameUrls: string[]) => {
      // This calls our backend function (which we will build in Phase 2)
      const { data, error } = await supabase.functions.invoke('process-lesson-frames', {
        body: { frameUrls },
      });
      if (error) throw error;
      return data;
    },
    {
      onSuccess: () => {
        setProcessingState('done');
        queryClient.invalidateQueries('instructions'); // Refresh the instruction list
        alert('New AI lesson created successfully!');
      },
      onError: (error: any) => {
        setProcessingState('error');
        alert(`Failed to process lesson: ${error.message}`);
      }
    }
  );

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      setIsRecording(true);
      setVideoURL(null);
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setVideoURL(url);
      };
      recorder.start();
    } catch (error) {
      console.error("Error starting screen recording:", error);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const processAndUpload = async () => {
    if (!videoURL) return;

    // 1. Load FFmpeg
    setProcessingState('loading');
    if (!ffmpegRef.current) {
        const ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => console.log(message));
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        ffmpegRef.current = ffmpeg;
    }
    const ffmpeg = ffmpegRef.current;
    
    // 2. Process video to extract frames
    setProcessingState('processing');
    ffmpeg.on('progress', ({ progress }) => setProgress(progress * 100));
    await ffmpeg.writeFile('input.webm', new Uint8Array(await (await fetch(videoURL)).arrayBuffer()));
    await ffmpeg.exec(['-i', 'input.webm', '-vf', 'fps=1', 'frame-%03d.jpg']); // Extract 1 frame per second
    setProgress(0);

    // 3. Upload frames to Supabase Storage
    setProcessingState('uploading');
    const files = await ffmpeg.listDir('.');
    const imageFiles = files.filter(f => f.name.endsWith('.jpg'));
    const frameUrls: string[] = [];
    const lessonId = crypto.randomUUID();

    for (const file of imageFiles) {
        if (!file.name) continue;
        const data = await ffmpeg.readFile(file.name);
        const filePath = `lessons/${lessonId}/${file.name}`;
        const { error } = await supabase.storage.from('instructions').upload(filePath, data as Blob);
        if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`);
        
        const { data: { publicUrl } } = supabase.storage.from('instructions').getPublicUrl(filePath);
        frameUrls.push(publicUrl);
    }

    // 4. Trigger the backend processing
    processVideoMutation.mutate(frameUrls);
  };

  return (
    <div className="w-full max-w-2xl p-6 border rounded-lg space-y-4">
      <h2 className="text-2xl font-bold">Lesson Studio (AI Vision)</h2>
      
      {!isRecording && !videoURL && (
        <Button onClick={startRecording}>Start Screen Recording</Button>
      )}

      {isRecording && (
        <Button onClick={stopRecording} variant="destructive">Stop Recording</Button>
      )}

      {videoURL && (
        <div className="space-y-4">
          <h3 className="font-semibold">Recording Complete. Preview:</h3>
          <video src={videoURL} controls className="w-full rounded-md" />
          <Button onClick={processAndUpload} disabled={processingState !== 'idle'} size="lg">
            Create AI Lesson from Video
          </Button>
        </div>
      )}

      {processingState !== 'idle' && processingState !== 'done' && (
        <div className="space-y-2">
            <p>Status: <strong>{processingState}...</strong></p>
            {processingState === 'processing' && <progress value={progress} max="100" className="w-full" />}
        </div>
      )}

    </div>
  );
};

export default LessonStudio;
