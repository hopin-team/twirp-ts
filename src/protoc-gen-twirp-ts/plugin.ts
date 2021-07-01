import {
  CodeGeneratorRequest,
  CodeGeneratorResponse_Feature,
  DescriptorRegistry,
  PluginBase,
  SymbolTable,
} from "@protobuf-ts/plugin-framework";
import { File } from "./file";
import { generate } from "./gen/twirp";
import { genGateway } from "./gen/gateway";
import { createLocalTypeName } from "./local-type-name";
import { Interpreter } from "./interpreter";
import * as fs from "fs";

export class ProtobuftsPlugin extends PluginBase<File> {

  parameters = {
    ts_proto: {
      description: "use the ts-proto compiler",
    },
    gateway: {
      description: "generate the twirp gateway",
    },
    index_file: {
      description: "generate an index.ts file that exports all the types"
    }
  }

  async generate(request: CodeGeneratorRequest): Promise<File[]> {
    const params = this.parseParameters(this.parameters, request.parameter),
        registry = DescriptorRegistry.createFrom(request),
        symbols = new SymbolTable(),
        interpreter = new Interpreter(registry)

    const ctx = {
      lib: params.ts_proto ? 'ts-proto' : 'protobuf-ts',
      symbols,
      registry,
      interpreter,
    };

    const files = [];

    for (let fileDescriptor of registry.allFiles()) {
      const messageFileOut = new File(`${fileDescriptor.name?.replace(".proto", "").toLowerCase()}`);

      registry.visitTypes(fileDescriptor, descriptor => {
        // we are not interested in synthetic types like map entry messages
        if (registry.isSyntheticElement(descriptor)) return;
        ctx.symbols.register(createLocalTypeName(descriptor, registry), descriptor, messageFileOut);
      });

      // Twirp generation
      const twirpFileOut = new File(`${fileDescriptor.name?.replace(".proto", "").toLowerCase()}.twirp.ts`);
      const twirpContent = await generate(ctx, fileDescriptor);
      twirpFileOut.setContent(twirpContent);
      files.push(twirpFileOut);
    }

    // Gateway generation
    if (params.gateway) {
      const gatewayFileOut = new File(`gateway.twirp.ts`);
      const gatewayContent = await genGateway(ctx, registry.allFiles());
      gatewayFileOut.setContent(gatewayContent);
      files.push(gatewayFileOut);
    }

    // Create index file
    if (params.index_file) {
      files.push(genIndexFile(registry, params.gateway));
    }

    return files;
  }

  // we support proto3-optionals, so we let protoc know
  protected getSupportedFeatures = () => [CodeGeneratorResponse_Feature.PROTO3_OPTIONAL];
}

function genIndexFile(registry: DescriptorRegistry, withGateway: boolean) {
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

  if (withGateway) {
    fileToExport.push('gateway.twirp');
  }

  const indexFile = new File('index.ts');

  return indexFile.setContent(fileToExport.map((fileName) => {
    return `export * from "./${fileName}";`
  }).join("\n"));
}

new ProtobuftsPlugin().run().then(() => {
  process.exit(0);
})
  .catch((e) => {
    process.stderr.write('FAILED!');
    process.stderr.write(e.message);
    process.stderr.write(e.stack);
    process.exit(1);
  });