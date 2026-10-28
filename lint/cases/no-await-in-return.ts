// Cases of lint/no-await-in-return.js, checked by test/lint.test.ts.
// Each line marked `flagged` must be reported, every other line must not.
declare function load(): Promise<number>;
declare function wrap(value: number): number;

export async function argument() {
  return wrap(await load()); // flagged
}

export async function operand() {
  return (await load()) + 1; // flagged
}

export const arrowBody = async () => wrap(await load()); // flagged

export async function alone() {
  return await load();
}

export async function ownLine() {
  const value = await load();

  return wrap(value);
}

export async function innerFunction() {
  return [1].map(async () => {
    const value = await load();

    return value;
  });
}

export const arrowAlone = async () => await load();
