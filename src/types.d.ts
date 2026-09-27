declare module 'fontfaceobserver' {
  export default class FontFaceObserver {
    constructor(family: string, descriptors?: Record<string, string>);
    load(text?: string | null, timeout?: number): Promise<void>;
  }
}
