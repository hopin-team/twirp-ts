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

export class ProtobuftsPlugin extends PluginBase<File> {

  parameters = {
    ts_proto: {
      description: "use the ts-proto compiler",
    },
    gateway: {
      description: "generate the twirp gateway",
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

    return files;
  }

  // we support proto3-optionals, so we let protoc know
  protected getSupportedFeatures = () => [CodeGeneratorResponse_Feature.PROTO3_OPTIONAL];
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