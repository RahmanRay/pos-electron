/** image2pipe JPEGs may be fragmented/coalesced; memory remains bounded. */
export class MjpegParser {
  private pending = Buffer.alloc(0);

  constructor(private readonly onFrame: (frame: Buffer) => void, private readonly maxBytes = 2 * 1024 * 1024) {}

  push(chunk: Buffer): void {
    if (chunk.length > this.maxBytes) {
      this.pending = Buffer.alloc(0);
      return;
    }
    this.pending = Buffer.concat([this.pending, chunk]);
    while (this.pending.length > 0) {
      const start = this.pending.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) {
        // A trailing FF may be the start marker split across chunks.
        this.pending = this.pending.subarray(Math.max(0, this.pending.length - 1));
        break;
      }
      if (start > 0) this.pending = this.pending.subarray(start);
      const end = this.pending.indexOf(Buffer.from([0xff, 0xd9]), 2);
      if (end < 0) {
        if (this.pending.length > this.maxBytes) this.pending = Buffer.alloc(0);
        break;
      }
      const frameLength = end + 2;
      if (frameLength <= this.maxBytes) this.onFrame(Buffer.from(this.pending.subarray(0, frameLength)));
      this.pending = this.pending.subarray(frameLength);
    }
  }
}
