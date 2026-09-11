/** Project rules that no off-the-shelf plugin covers. Small, literal, with a clear message. */
export default {
  rules: {
    "no-member-id-in-request-schemas": {
      meta: { type: "problem", docs: { description: "Request schemas must not accept memberId — the actor comes from the session." }, schema: [] },
      create(ctx) {
        return {
          Property(node) {
            const key = node.key?.name ?? node.key?.value;
            if (["memberId", "member_id", "userId", "user_id", "ownerId"].includes(key)) {
              ctx.report({ node, message: `"${key}" in a request schema is an IDOR vector. The actor is c.get("principal"), never client input.` });
            }
          },
        };
      },
    },
    "no-inline-color": {
      meta: { type: "problem", docs: { description: "Colors come from @bbc/ui tokens, never inline hex/rgba." }, schema: [] },
      create(ctx) {
        const re = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
        return {
          Literal(node) { if (typeof node.value === "string" && re.test(node.value)) ctx.report({ node, message: "Inline color. Use tokens.colors.*" }); },
          TemplateElement(node) { if (re.test(node.value.raw)) ctx.report({ node, message: "Inline color in template. Use tokens.colors.*" }); },
        };
      },
    },
    "require-test-id": {
      meta: { type: "problem", docs: { description: "Interactive elements need testID for Maestro." }, schema: [] },
      create(ctx) {
        const interactive = new Set(["Pressable", "TouchableOpacity", "TextInput", "Button", "Field", "PasswordField", "CodeInput", "ListRow", "ProposalCard", "ProposalRow"]);
        return {
          JSXOpeningElement(node) {
            const name = node.name?.name;
            if (!interactive.has(name)) return;
            const has = node.attributes.some((a) => a.type === "JSXAttribute" && a.name?.name === "testID");
            if (!has) ctx.report({ node, message: `<${name}> needs a testID (screen.element).` });
          },
        };
      },
    },
  },
};
