import antfu from '@antfu/eslint-config';

export default antfu({
  stylistic: {
    semi: true,
    // https://eslint.style/rules
    overrides: {
      'style/brace-style': ['error', '1tbs'],
      // 'style/nonblock-statement-body-position': ['off', 'below'],
    },
  },
  ignores: ['tsconfig.json'],
  rules: {
    // https://eslint.org/docs/latest/rules/curly
    curly: ['error', 'all'],
  },
  formatters: {
    html: true,
  },
});
