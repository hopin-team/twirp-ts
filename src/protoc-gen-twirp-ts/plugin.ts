import {
  CodeGeneratorRequest,
  CodeGeneratorResponse_Feature,
  DescriptorRegistry,
  PluginBase,
  SymbolTable,
} from "@protobuf-ts/plugin-framework";
import { File } from "./file";
import {
  generateTwirp,
  generateTwirpClient,
  generateTwirpServer,
} from "./gen/twirp";
import { genGateway } from "./gen/gateway";
import { createLocalTypeName } from "./local-type-name";
import { Interpreter } from "./interpreter";
import { genOpenAPI, OpenAPIType } from "./gen/open-api";
import { genIndexFile } from "./gen/index-file";

export class ProtobuftsPlugin extends PluginBase<File> {
  parameters = {
    ts_proto: {
      description: "Use the ts-proto compiler (protobuf-ts by default)",
    },
    gateway: {
      description: "Generates the twirp gateway",
    },
    index_file: {
      description: "Generates an index.ts file that exports all the types",
    },
    emit_default_values: {
      description: "Json encode and decode will emit default values",
    },
    openapi_twirp: {
      description: "Generates an OpenAPI spec for twirp handlers",
    },
    openapi_gateway: {
      description: "Generates an OpenAPI spec for gateway handlers",
    },
    standalone: {
      description: "Generates client and server in 2 separate files",
    },
    client_only: {
      description: "Only client will be generated (overrides 'standalone')",
    },
    server_only: {
      description: "Only server will be generated (overrides 'standalone')",
    },
    camel_case: {
      description: "Generates with method names in camel case.",
    },
  };

  async generate(request: CodeGeneratorRequest): Promise<File[]> {
    const params = this.parseOptions(this.parameters, request.parameter),
      registry = DescriptorRegistry.createFrom(request),
      symbols = new SymbolTable(),
      interpreter = new Interpreter(registry);

    const ctx = {
      lib: params.ts_proto ? "ts-proto" : "protobuf-ts",
      emitDefaultValues: params.emit_default_values,
      symbols,
      registry,
      interpreter,
      camelCase: params.camel_case,
    };

    const files = [];

    for (let fileDescriptor of registry.allFiles()) {
      const messageFileOut = new File(
        `${fileDescriptor.name?.replace(".proto", "").toLowerCase()}`
      );

      registry.visitTypes(fileDescriptor, (descriptor) => {
        // we are not interested in synthetic types like map entry messages
        if (registry.isSyntheticElement(descriptor)) return;
        ctx.symbols.register(
          createLocalTypeName(descriptor, registry),
          descriptor,
          messageFileOut
        );
      });

      // Generate a combined client and server bundle if no code gen
      // options are passed.
      if (!params.standalone && !params.client_only && !params.server_only) {
        const twirpFileOut = new File(
          `${fileDescriptor.name?.replace(".proto", "").toLowerCase()}.twirp.ts`
        );
        const twirpFileContent = await generateTwirp(ctx, fileDescriptor);
        twirpFileOut.setContent(twirpFileContent);
        files.push(twirpFileOut);
      }

      if (params.server_only && params.client_only) {
        throw new Error(
          "Only one of server_only or client_only can be passed."
        );
      }

      if (params.server_only || params.standalone) {
        const serverFileOut = new File(
          `${fileDescriptor.name?.replace(".proto", "").toLowerCase()}.twirp.ts`
        );
        const serverContent = await generateTwirpServer(ctx, fileDescriptor);
        serverFileOut.setContent(serverContent);
        files.push(serverFileOut);
      }

      if (params.client_only || params.standalone) {
        const clientFileOut = new File(
          `${fileDescriptor.name
            ?.replace(".proto", "")
            .toLowerCase()}.twirp-client.ts`
        );
        const clientContent = await generateTwirpClient(ctx, fileDescriptor);
        clientFileOut.setContent(clientContent);
        files.push(clientFileOut);
      }
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
        ...(await genOpenAPI(ctx, registry.allFiles(), OpenAPIType.TWIRP))
      );
    }

    if (params.openapi_gateway) {
      docs.push(
        ...(await genOpenAPI(ctx, registry.allFiles(), OpenAPIType.GATEWAY))
      );
    }

    docs.forEach((doc) => {
      const file = new File(`${doc.fileName}`);
      file.setContent(doc.content);
      files.push(file);
    });

    return files;
  }

  // we support proto3-optionals, so we let protoc know
  protected getSupportedFeatures = () => [
    CodeGeneratorResponse_Feature.PROTO3_OPTIONAL,
  ];
}

new ProtobuftsPlugin()
  .run()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write("FAILED!");
    process.stderr.write(e.message);
    process.stderr.write(e.stack);
    process.exit(1);
  });
