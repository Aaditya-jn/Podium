export function shouldRunCameraTracking(input: { consented: boolean; recording: boolean; pageVisible: boolean }) {
  return input.consented && input.recording && input.pageVisible;
}

export function stopMediaStreamTracks(stream: Pick<MediaStream, "getTracks">) {
  stream.getTracks().forEach((track) => track.stop());
}
