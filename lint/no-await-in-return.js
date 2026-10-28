// An `await` nested inside a returned expression hides a step: write it as
// `const value = await ...;` on its own line, then return. `return await x;`
// alone stays allowed: the await is the whole expression.

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function returnedBy(node) {
  let child = node;
  let parent = node.parent;

  while (parent && !FUNCTION_TYPES.has(parent.type)) {
    if (parent.type === 'ReturnStatement') {
      return parent.argument === node ? null : parent;
    }

    child = parent;
    parent = parent.parent;
  }

  // An arrow function with an expression body returns that expression.
  const expressionBody = parent && parent.type === 'ArrowFunctionExpression' && parent.body.type !== 'BlockStatement';

  if (expressionBody && parent.body === child && parent.body !== node) {
    return parent;
  }

  return null;
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow `await` nested inside a returned expression' },
    messages: {
      nested: 'Move this `await` to its own `const` before returning.',
    },
    schema: [],
  },
  create(context) {
    return {
      AwaitExpression(node) {
        if (returnedBy(node)) {
          context.report({ node, messageId: 'nested' });
        }
      },
    };
  },
};

export default {
  meta: { name: 'local' },
  rules: { 'no-await-in-return': rule },
};
