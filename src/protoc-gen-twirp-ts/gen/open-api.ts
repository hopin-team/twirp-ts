import {
  AnyDescriptorProto,
  DescriptorProto,
  DescriptorRegistry,
  EnumDescriptorProto,
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
import { getMethod, HttpOption, Pattern } from "./gateway";

interface OpenAPIDoc {
  fileName: string,
  content: string,
}

export enum OpenAPIType {
  GATEWAY,
  TWIRP
}

/**
 * Generate twirp compliant OpenAPI doc
 * @param ctx
 * @param files
 * @param type
 */
export async function genOpenAPI(ctx: any, files: readonly FileDescriptorProto[], type: OpenAPIType) {
  const documents: OpenAPIDoc[] = [];

  files.forEach(file => {
    file.service.forEach((service) => {
      const document: OpenAPIV3.Document = {
        openapi: "3.0.3",
        info: {
          title: `${service.name}`,
          version: "1.0.0"
        },
        paths: type === OpenAPIType.TWIRP ?
          genTwirpPaths(ctx, file, service) :
          genGatewayPaths(ctx, file, service),
        components: genComponents(ctx, service.method),
      }

      const fileName = type === OpenAPIType.TWIRP ?
        `${service.name?.toLowerCase()}.twirp.yaml` :
        `${service.name?.toLowerCase()}.yaml`

      documents.push({
        fileName,
        content: yaml.stringify(document),
      });
    })
  })

  return documents;
}

/**
 * Generates OpenAPI Twirp URI paths
 * @param ctx
 * @param file
 * @param service
 */
function genTwirpPaths(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
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

/**
 * Generates OpenAPI Twrip Gateway URI paths
 * @param ctx
 * @param file
 * @param service
 */
function genGatewayPaths(ctx: any, file: FileDescriptorProto, service: ServiceDescriptorProto) {
  const registry = ctx.registry as DescriptorRegistry;

  /**
   * Build paths recursively
   * @param method
   * @param httpSpec
   * @param paths
   */
  function buildPath(method: MethodDescriptorProto, httpSpec: HttpOption, paths: OpenAPIV3.PathsObject) {
    const httpMethod = getMethod(httpSpec)
    const description = genDescription(ctx, method);

    const pathItem = {
      [httpMethod]: {
        summary: description,
        operationId: `${service.name}_${method.name}`,
      }
    } as OpenAPIV3.PathItemObject

    const inputMessage = registry.resolveTypeName(method.inputType!) as DescriptorProto;
    const outPutMessage = registry.resolveTypeName(method.outputType!) as DescriptorProto;

    // All methods except GET have body
    if (httpMethod !== Pattern.GET) {
      pathItem[httpMethod]!.requestBody = genGatewayBody(ctx, httpSpec, inputMessage)
    }

    // All methods might have params
    pathItem[httpMethod]!.parameters = genGatewayParams(ctx, httpSpec, inputMessage)
    pathItem[httpMethod]!.responses = genGatewayResponse(ctx, httpSpec, outPutMessage)

    paths[`${httpSpec[httpMethod]}`] = pathItem;

    if (httpSpec.additional_bindings) {
      buildPath(method, httpSpec.additional_bindings, paths)
    }
  }

  return service.method.reduce((paths, method) => {
    const options = ctx.interpreter.readOptions(method);

    if (!options && options["google.api.http"]) {
      return paths;
    }

    const httpSpec = options["google.api.http"] as HttpOption

    buildPath(method, httpSpec, paths);

    return paths;
  }, {} as OpenAPIV3.PathsObject)
}

/**
 * Generate OpenAPI Gateway Response
 * @param ctx
 * @param httpOptions
 * @param message
 */
function genGatewayResponse(ctx: any, httpOptions: HttpOption, message: DescriptorProto): OpenAPIV3.ResponsesObject {
  let schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject = {};

  if (httpOptions.responseBody !== "") {
    schema = {
      type: "object",
      properties: {
        [httpOptions.responseBody]: {
          $ref: `#/components/schemas/${message.name}`
        }
      }
    }
  } else {
    schema = {
      $ref: `#/components/schemas/${message.name}`
    }
  }

  return {
    "200": {
      description: "OK",
      content: {
        "application/json": {
          schema,
        }
      }
    }
  }
}

/**
 * Generate OpenAPI Gateway Response
 * @param ctx
 * @param httpOptions
 * @param message
 */
function genGatewayBody(ctx: any, httpOptions: HttpOption, message: DescriptorProto): OpenAPIV3.RequestBodyObject {
  const schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject = {}

  if (httpOptions.body === "*") {
    (schema as OpenAPIV3.ReferenceObject).$ref = `#/components/schemas/${message.name}`
  } else {
    const subField = message.field.find(field => field.name === httpOptions.body);

    if (!subField) {
      throw new Error(`the body field ${httpOptions.body} cannot be mapped to message ${message.name}`)
    }

    schema.properties = {
      [httpOptions.body]: genField(ctx, subField),
    }
  }

  return {
    required: true,
    content: {
      "application/json": {
        schema,
      }
    }
  }
}

/**
 * Generates OpenAPI Gateway Parameters
 * @param ctx
 * @param httpOptions
 * @param message
 */
function genGatewayParams(ctx: any, httpOptions: HttpOption, message: DescriptorProto): (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[] {
  const httpMethod = getMethod(httpOptions)
  const params = parseUriParams(httpOptions[httpMethod])

  const urlParams = message.field
    .filter((field) =>
      params.find((param) => param === field.name)
    )
    .map((field) => {
      return {
        name: field.name,
        in: "path",
        required: true,
        schema: {
          ...genField(ctx, field)
        }
      } as OpenAPIV3.ParameterObject
    })

  if (httpOptions.body === "*") {
    return urlParams
  }

  const queryString = message.field
    .filter((field) =>
      field.name !== httpOptions.body &&
      !params.find(param => param === field.name!)
    )
    .map((field) => {
      return {
        name: field.name,
        in: "query",
        schema: {
          ...genField(ctx, field)
        }
      } as OpenAPIV3.ParameterObject
    })

  return [
    ...queryString,
    ...urlParams,
  ]
}

/**
 * Generates OpenAPI Components
 * @param ctx
 * @param methods
 */
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

/**
 * Generate OpenAPI Schemas
 * @param ctx
 * @param schemas
 * @param typeName
 */
function genSchema(ctx: any, schemas: OpenAPIV3.ComponentsObject["schemas"], typeName: string) {
  const registry = ctx.registry as DescriptorRegistry;

  const localName = localMessageName(ctx, typeName);

  if (!localName) {
    return;
  }

  const descriptor = registry.resolveTypeName(typeName) as DescriptorProto;

  if (schemas![localName] || registry.isSyntheticElement(descriptor)) {
    return;
  }

  // Handle OneOf
  if (descriptor.field.some((field) => registry.isUserDeclaredOneof(field))) {
    schemas![localName] = genOneOfType(ctx, descriptor);

    descriptor.oneofDecl.forEach((oneOfField, index) => {
      const oneOfTyName = `${localName}_${capitalizeFirstLetter(oneOfField.name!)}`;

      const oneOfFields = descriptor.field.filter(field => {
        return field.oneofIndex === index;
      })
      schemas![oneOfTyName] = genOneOfTypeKind(ctx, descriptor, oneOfFields);
    })
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

/**
 * Generate an OpenAPI type
 * @param ctx
 * @param message
 */
function genType(ctx: any, message: DescriptorProto): OpenAPIV3.SchemaObject {
  const description = genDescription(ctx, message)

  return {
    properties: genMessageProperties(ctx, message),
    description,
  }
}

/**
 * Generate a Protobuf to OpenAPI oneof type
 * @param ctx
 * @param message
 */
function genOneOfType(ctx: any, message: DescriptorProto): OpenAPIV3.SchemaObject {
  const description = genDescription(ctx, message)

  const oneOf = {
    allOf: [
      {
        type: "object",
        properties: genMessageProperties(ctx, message),
      },
    ] as (OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject)[],
    description,
  }

  message.oneofDecl.forEach((field) => {
    oneOf.allOf.push({
      $ref: `#/components/schemas/${message.name}_${capitalizeFirstLetter(field.name!)}`
    })
  })

  return oneOf;
}

/**
 * Generate one of type
 * @param ctx
 * @param message
 * @param oneOfFields
 */
function genOneOfTypeKind(ctx: any, message: DescriptorProto, oneOfFields: FieldDescriptorProto[]): OpenAPIV3.SchemaObject {
  return {
    oneOf: oneOfFields.map((oneOf) => {
      return {
        type: "object",
        properties: {
          [oneOf.name!]: genField(ctx, oneOf),
        }
      }
    })
  }

}

/**
 * Generate message properties
 * @param ctx
 * @param message
 */
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

/**
 * Generates OpenAPI $ref
 * @param ctx
 * @param name
 */
function genRef(ctx: any, name: string) {
  const messageType = localMessageName(ctx, name)
  return `#/components/schemas/${messageType}`
}

/**
 * Generate field definition
 * @param ctx
 * @param field
 */
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

/**
 * Generates enum definition
 * @param enumType
 */
function genEnum(enumType: EnumDescriptorProto): OpenAPIV3.SchemaObject {
  return {
    type: 'string',
    enum: enumType.value.map((value) => {
      return value.name
    })
  }
}

/**
 * Generate scalar
 * @param type
 */
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

/**
 * Generates the description
 * @param ctx
 * @param descriptor
 */
function genDescription(ctx: any, descriptor: AnyDescriptorProto) {
  const registry = ctx.registry as DescriptorRegistry;

  const source = registry.sourceCodeComments(descriptor);
  const description = source.leading || source.trailing || "";

  return description.trim();
}

/**
 * Format protobuf name
 * @param ctx
 * @param name
 */
function localMessageName(ctx: any, name: string) {
  const registry = ctx.registry as DescriptorRegistry;
  const symbols = ctx.symbols as SymbolTable;

  const entry = symbols.find(registry.resolveTypeName(name!))!;

  if (!entry) {
    return "";
  }

  return createLocalTypeName(entry.descriptor, registry);
}

function parseUriParams(uri: string) {
  return getMatches(uri, /{([a-zA-Z_0-9]+)}/g, 1)
}

function getMatches(str: string, regex: RegExp, index: number = 1) {
  const matches = [];
  let match;
  while (match = regex.exec(str)) {
    matches.push(match[index]);
  }
  return matches;
}


function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
