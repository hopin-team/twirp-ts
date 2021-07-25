import { DescriptorRegistry } from "@protobuf-ts/plugin-framework";
import { File } from "../file";

export function genIndexFile(registry: DescriptorRegistry, files: File[]) {
  const fileToExport = registry.allFiles()
    .filter((fileDescriptor) => {
      let hasExports = false;
      registry.visitTypes(fileDescriptor, descriptor => {
        // we are not interested in synthetic types like map entry messages
        if (registry.isSyntheticElement(descriptor)) return;
        hasExports = true;
      });

      return hasExports;
    })
    .map((file => file.name?.replace(".proto", "")));

  const compiledFiles = files.filter(file => file.getContent() !== "").map(file => {
    return file.fileName.replace(".ts", "")
  });

  if (compiledFiles.length > 0) {
    fileToExport.push(
      ...compiledFiles,
    )
  }

  const indexFile = new File('index.ts');

  return indexFile.setContent(fileToExport.map((fileName) => {
    return `export * from "./${fileName}";`
  }).join("\n"));
}