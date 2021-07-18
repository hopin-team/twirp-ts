import {
  AnyDescriptorProto,
  DescriptorProto,
  DescriptorRegistry, EnumDescriptorProto,
  FieldDescriptorProto,
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorProto,
  MethodDescriptorProto,
  ScalarValueType,
  ServiceDescriptorProto,
  SymbolTable
} from "@protobuf-ts/plugin-framework";
import * as yaml from 'yaml';
import { OpenAPIV3 } from "openapi-types";
import { createLocalTypeName } from "../local-type-name";
import * as fs from "fs";

interface OpenAPIDoc {
  fileName: string,
  content: string,
}

export async function genOpenAPI(ctx: any, files: readonly FileDescriptorProto[]) {
  const documents: OpenAPIDoc[] = [];

  files.forEach(file => {
    file.service.forEach((service) => {
      const document: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: {
          title: `${service.name}`,
          version: "" // TODO
        },
        paths: genPaths(ctx, file, service),
        components: genComponents(ctx, service.method),
      }

      documents.push({
        fileName: `${service.name?.toLowerCase()}.twirp.yaml`,
        content: yaml.stringify(document),
      });
    })
  })

  return documents;
}

function genPaths(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
  return service.method.reduce((paths, method) => {
    const description = genDescription(ctx, method);

    paths[`/${file.package}.${service.name}/${method.name}`] = {
      post: {
        summary: description,
        operationId: `${service.name}_${method.name}`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: genRef(ctx, method.inputType!)
              }
            }
          }
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  $ref: genRef(ctx, method.outputType!),
                }
              }
            }
          }
        }
      }
    }
    return paths;
  }, {} as OpenAPIV3.PathsObject)
}

function genComponents(ctx: any, methods: MethodDescriptorProto[]) {
  const components: OpenAPIV3.ComponentsObject = {
    schemas: {}
  };

  methods.reduce((schemas, method) => {
    genSchema(ctx, schemas, method.inputType!);
    genSchema(ctx, schemas, method.outputType!);

    return schemas;
  }, components.schemas)

  return components;
}

function genSchema(ctx: any, schemas: OpenAPIV3.ComponentsObject["schemas"], typeName: string)  {
  const registry = ctx.registry as DescriptorRegistry;

  const localName = localMessageName(ctx, typeName);

  if (!localName) {
    return;
  }

  const descriptor = registry.resolveTypeName(typeName) as DescriptorProto;

  if (schemas![localName] || registry.isSyntheticElement(descriptor)) {
    return;
  }

  if (descriptor.field.some((field) => registry.isUserDeclaredOneof(field))) {
    schemas![localName] = genOneOfType(ctx, descriptor);
    schemas![`${localName}__Kind`] = genOneOfTypeKind(ctx, descriptor);
  } else {
    schemas![localName] = genType(ctx, descriptor);
  }

  descriptor.field.forEach((field) => {
    if (field.type !== FieldDescriptorProto_Type.MESSAGE) {
      return;
    }

    if (registry.isSyntheticElement(descriptor)) {
      return;
    }

    genSchema(ctx, schemas, field.typeName!);
  })
}

function genType(ctx: any, message: DescriptorProto): OpenAPIV3.SchemaObject {
  const description = genDescription(ctx, message)

  return {
    properties: genMessageProperties(ctx, message),
    description,
  }
}

function genOneOfType(ctx: any, message: DescriptorProto): OpenAPIV3.SchemaObject {
  const description = genDescription(ctx, message)

  return {
    allOf: [
      {
        type: "object",
        properties: genMessageProperties(ctx, message),
      },
      {
        $ref: `#/components/schemas/${message.name}__Kind`
      }
    ],
    description,
  }
}

function genOneOfTypeKind(ctx: any, message: DescriptorProto): OpenAPIV3.SchemaObject {
  const registry = ctx.registry as DescriptorRegistry;

  return {
    oneOf: message.field.filter((field) => {
      return registry.isUserDeclaredOneof(field)
    }).map((oneOf) => {
      return {
        type: "object",
        properties: {
          [oneOf.name!]: {
            $ref: genRef(ctx, oneOf.typeName!)
          },
        }
      }
    })
  }

}

function genMessageProperties(ctx: any, message: DescriptorProto): OpenAPIV3.SchemaObject["properties"] {
  const registry = ctx.registry as DescriptorRegistry;

  return message.field.reduce((fields, field) => {

    if (registry.isUserDeclaredOneof(field)) {
      return fields
    }

    fields![field.name!] = genField(ctx, field!)

    return fields
  }, {} as OpenAPIV3.SchemaObject["properties"]);
}


function genRef(ctx: any, name: string) {
  const messageType = localMessageName(ctx, name)
  return `#/components/schemas/${messageType}`
}

function localMessageName(ctx: any, name: string) {
  const registry = ctx.registry as DescriptorRegistry;
  const symbols = ctx.symbols as SymbolTable;

  const entry = symbols.find(registry.resolveTypeName(name!))!;

  if (!entry) {
    return "";
  }

  return createLocalTypeName(entry.descriptor, registry);
}

function genField(ctx: any, field: FieldDescriptorProto): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  let openApiType: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
  const registry = ctx.registry as DescriptorRegistry;

  switch (field.type) {
    case FieldDescriptorProto_Type.DOUBLE:
    case FieldDescriptorProto_Type.FLOAT:
    case FieldDescriptorProto_Type.BOOL:
    case FieldDescriptorProto_Type.STRING:
    case FieldDescriptorProto_Type.FIXED32:
    case FieldDescriptorProto_Type.FIXED64:
    case FieldDescriptorProto_Type.INT32:
    case FieldDescriptorProto_Type.INT64:
    case FieldDescriptorProto_Type.SFIXED32:
    case FieldDescriptorProto_Type.SFIXED64:
    case FieldDescriptorProto_Type.SINT32:
    case FieldDescriptorProto_Type.SINT64:
    case FieldDescriptorProto_Type.UINT32:
    case FieldDescriptorProto_Type.UINT64:
      openApiType = {
        type: genScalar(field.type),
      }
      break;
    case FieldDescriptorProto_Type.BYTES:
      openApiType = {
        type: "array",
        items: {
          type: "integer",
        }
      }
      break;
    case FieldDescriptorProto_Type.ENUM:
      const enumType = registry.getEnumFieldEnum(field)
      openApiType = genEnum(enumType);
      break;
    case FieldDescriptorProto_Type.MESSAGE:

      // Map type
      if (registry.isMapField(field)) {
        const mapTypeValue = registry.getMapValueType(field)

        if (typeof mapTypeValue === "number") {
          const scalar = mapTypeValue as ScalarValueType;
          openApiType = {
            type: "object",
            additionalProperties: {
              type: genScalar(scalar)
            }
          }
        } else if (EnumDescriptorProto.is(field)) {
          openApiType = {
            type: "object",
            additionalProperties: {
              ...genEnum(field)
            }
          }
        } else if (DescriptorProto.is(field)) {
          openApiType = {
            type: "object",
            additionalProperties: {
              $ref: genRef(ctx, field.name!),
            }
          }
        } else {
          throw new Error("map value not supported")
        }
        break
      }

      openApiType = {
        $ref: genRef(ctx, field.typeName!),
      }
      break
    default:
      throw new Error(`${field.name} of type ${field.type} not supported`)
  }

  const description = genDescription(ctx, field)

  if (field.label === FieldDescriptorProto_Label.REPEATED && !registry.isMapField(field)) {
    return {
      type: "array",
      items: openApiType,
      description: description || "",
    }
  }

  if (field.type !== FieldDescriptorProto_Type.MESSAGE) {
    (openApiType as OpenAPIV3.SchemaObject).description = description || "";
  }

  return openApiType;
}

function genEnum(enumType: EnumDescriptorProto): OpenAPIV3.SchemaObject {
  return {
    type: 'string',
    enum: enumType.value.map((value) => {
      return value.name
    })
  }
}

function genScalar(type: FieldDescriptorProto_Type) {
  switch (type) {
    case FieldDescriptorProto_Type.BOOL:
      return "boolean"
    case FieldDescriptorProto_Type.DOUBLE:
    case FieldDescriptorProto_Type.FLOAT:
      return "number"
    case FieldDescriptorProto_Type.STRING:
      return "string"
    case FieldDescriptorProto_Type.FIXED32:
    case FieldDescriptorProto_Type.FIXED64:
    case FieldDescriptorProto_Type.INT32:
    case FieldDescriptorProto_Type.INT64:
    case FieldDescriptorProto_Type.SFIXED32:
    case FieldDescriptorProto_Type.SFIXED64:
    case FieldDescriptorProto_Type.SINT32:
    case FieldDescriptorProto_Type.SINT64:
    case FieldDescriptorProto_Type.UINT32:
    case FieldDescriptorProto_Type.UINT64:
      return "integer"
    default:
      throw new Error(`${type} is not a scalar value`)
  }
}

function genDescription(ctx: any, descriptor: AnyDescriptorProto) {
  const registry = ctx.registry as DescriptorRegistry;

  const source = registry.sourceCodeComments(descriptor);
  const description = source.leading || source.trailing || "";

  return description.trim();
}