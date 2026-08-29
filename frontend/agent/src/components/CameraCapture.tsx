import { useEffect, useRef, useState } from "react";

/**
 * Live device-camera capture (laptop webcam or phone camera via
 * getUserMedia) for the "scan a bill/PO" flow in Composer.tsx — a
 * separate path from its plain file-attach button, for a machine with
 * no scanner and no way to get a photo onto disk first. Draws one
 * frame to a canvas and exports it as a compressed JPEG under the 2MB
 * the backend enforces (agent.routes.ts's /scan route), stepping
 * quality down automatically if the first pass doesn't fit rather than
 * failing outright on a high-resolution camera.
 */
export function CameraCapture({ onCapture, onCancel }: { onCapture: (file: File) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => setError(err.message || "Could not access the camera — check your browser's camera permission for this site."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= 2 * 1024 * 1024) {
          onCapture(new File([blob], "scan.jpg", { type: "image/jpeg" }));
          return;
        }
      }
      setError("Couldn't compress the photo under 2MB — move back from the document or use the attach button with a smaller file instead.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="camera-overlay" onClick={onCancel}>
      <div className="camera-panel" onClick={(e) => e.stopPropagation()}>
        {error ? (
          <div className="camera-error">{error}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        )}
        <div className="camera-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          {!error && (
            <button type="button" onClick={capture} disabled={capturing}>
              {capturing ? "Capturing…" : "Capture"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
