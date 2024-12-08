const { override, addBabelPlugins } = require("customize-cra");

module.exports = override(
  ...addBabelPlugins(
    "@babel/plugin-proposal-class-properties",
    "@babel/plugin-proposal-private-methods"
  )
);
