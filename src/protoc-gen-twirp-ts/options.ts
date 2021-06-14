

export interface Options {
    out: string
}

export function optionsFromParameters(parameters: string): Options {
    return parseParameter(parameters);
}

// A very naive parse function, eventually could/should use iots/runtypes
function parseParameter(parameter: string): Options {
    const options = {} as any;
    const pairs = parameter.split(',').map((s) => s.split('='));
    pairs.forEach(([key, value]) => {
        options[key] = value === 'true' ? true : value === 'false' ? false : value;
    });
    return options;
}