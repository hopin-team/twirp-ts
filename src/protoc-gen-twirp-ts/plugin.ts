import { CodeGeneratorRequest, DescriptorRegistry, PluginBase, SymbolTable, TypescriptFile, TypeScriptImports } from "@protobuf-ts/plugin-framework";
import { File } from "./file";
import { generate } from "./generator";
import { genGateway } from "./gateway";
import { optionsFromParameters } from "./options";

const {createTypeMap} = require('ts-proto/build/types');

export class ProtobuftsPlugin extends PluginBase<File> {

  parameters = {

    // long type
    protobufjs: {
      description: "",
      excludes: [],
    },

    async generate(request: CodeGeneratorRequest): File[] | Promise<File[]> {
      const registry = DescriptorRegistry.createFrom(request),
            symbols = new SymbolTable(),
            imports = new TypeScriptImports(symbols);

      const options = optionsFromParameters(request.parameter || "");
      const typeMap = createTypeMap(request, {})
      const ctx = { typeMap, lib: options.protobufts ? 'protobuf-ts' : 'ts-proto' };

      const generated = request.protoFile.map(protoFile => generate(ctx, protoFile));

      const files = (await Promise.all(generated)).reduce((all, batch) => {
        all.push(...batch);
        return all;
      }, [])

      if (options.gateway) {
        files.push(await genGateway(ctx, request.protoFile))
      }

      return files;
    }
  }
}