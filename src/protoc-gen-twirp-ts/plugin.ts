import {
    CodeGeneratorRequest,
    CodeGeneratorResponse,
} from 'ts-proto-descriptors';

import { promisify } from 'util';
import {generate} from "./generator";
import {optionsFromParameters} from "./options";
const {readToBuffer} = require('ts-proto/build/utils');
const {createTypeMap} = require('ts-proto/build/types');

async function main() {
    const stdin: Buffer = await readToBuffer(process.stdin);

    const request = CodeGeneratorRequest.decode(stdin);
    const options = optionsFromParameters(request.parameter);
    const typeMap = createTypeMap(request, {})
    const ctx = { typeMap };

    const generated = request.protoFile.map(protoFile => generate(ctx, protoFile));

    const files = (await Promise.all(generated)).reduce((all, batch) => {
        all.push(...batch);
        return all;
    }, [])

    const response = CodeGeneratorResponse.fromPartial({
       file: files,
    });

    const buffer = CodeGeneratorResponse.encode(response).finish();
    const write = promisify(process.stdout.write as (buffer: Buffer) => boolean).bind(process.stdout);
    await write(Buffer.from(buffer));
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        process.stderr.write('FAILED!');
        process.stderr.write(e.message);
        process.stderr.write(e.stack);
        process.exit(1);
    });