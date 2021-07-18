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
import { genOpenAPI, OpenAPIType } from "./gen/open-api";

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
    },
    emit_default_values: {
      description: "Json encode and decode will emit default values"
    },
    openapi_twirp: {
      description: "Generates an OpenAPI spec for twirp handlers"
    },
    openapi_gateway: {
      description: "Generates an OpenAPI spec for gateway handlers"
    }
  }

  async generate(request: CodeGeneratorRequest): Promise<File[]> {
    const params = this.parseParameters(this.parameters, request.parameter),
        registry = DescriptorRegistry.createFrom(request),
        symbols = new SymbolTable(),
        interpreter = new Interpreter(registry)

    const ctx = {
      lib: params.ts_proto ? 'ts-proto' : 'protobuf-ts',
      emitDefaultValues: params.emit_default_values,
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
      files.push(genIndexFile(registry, [...files]));
    }

    // Open API
    const docs = [];
    if (params.openapi_twirp) {
      docs.push(
        ...(await genOpenAPI(ctx, registry.allFiles(), OpenAPIType.TWIRP)),
      )
    }

    if (params.openapi_gateway) {
      docs.push(
        ...(await genOpenAPI(ctx, registry.allFiles(), OpenAPIType.GATEWAY)),
      )
    }

    docs.forEach((doc) => {
      const file = new File(`${doc.fileName}`)
      file.setContent(doc.content)
      files.push(file)
    })

    return files;
  }

  // we support proto3-optionals, so we let protoc know
  protected getSupportedFeatures = () => [CodeGeneratorResponse_Feature.PROTO3_OPTIONAL];
}

function genIndexFile(registry: DescriptorRegistry, files: File[]) {
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

new ProtobuftsPlugin().run().then(() => {
  process.exit(0);
})
  .catch((e) => {
    process.stderr.write('FAILED!');
    process.stderr.write(e.message);
    process.stderr.write(e.stack);
    process.exit(1);
  });