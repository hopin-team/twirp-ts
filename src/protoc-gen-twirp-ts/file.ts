import { GeneratedFile } from "@protobuf-ts/plugin-framework";

export class File implements GeneratedFile {
  private content = "";

  constructor(public readonly fileName: string) {}

  getFilename(): string {
    return this.fileName;
  }

  setContent(content: string) {
    this.content = content;
    return this;
  }

  getContent(): string {
    return this.content;
  }
}
