<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

# Code style

Write the simplest implementation that meets the current requirement. Keep it
readable, correct, and minimally viable. Add complexity only when a concrete need
justifies it. These rules are a starting point to refine as we work.

## Functions and readability

- Every function should perform a meaningful operation with clear inputs and
  outputs. Use concrete names that describe the work.
- Keep related logic together so a reader can follow the core functionality
  without tracing several layers of helpers.
- Extract a helper when it makes substantial logic easier to understand or serves
  a concrete reuse need. Avoid trivial wrappers and unnecessary indirection.
- Prefer straightforward control flow and named intermediate values. Function
  length matters less than coherence; do not split functions just to make them
  shorter.

## Functional programming

- Prefer pure functions: pass inputs explicitly, return results, and avoid
  mutating inputs or shared state.
- Keep side effects such as database calls, network requests, and state updates
  explicit and easy to locate. Keep calculations independent of those effects
  when doing so improves clarity, without adding extra layers.
- Use simple transformations such as `map` and `filter` where they read naturally.
  Avoid clever composition, currying, and dense `reduce` expressions that obscure
  the work. Use a straightforward loop when it is easier to follow.

## Minimal implementation

- Build for the current requirement. Do not introduce abstractions for imagined
  future use cases.
- Start with direct code. Introduce shared machinery when actual use cases show
  what needs to be shared; allow a little duplication until then.
- Avoid speculative configuration, extension points, generic helpers, factories,
  and extra architectural layers.
- Every function and abstraction should earn its place by making the current
  implementation easier to understand or maintain.

References: [Google's code review guidance](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
for simplicity and [Mostly Adequate, chapter 3](https://github.com/MostlyAdequate/mostly-adequate-guide/blob/master/ch03.md)
for pure functions. Follow the practical rules above when broader guidance would
add unnecessary complexity.

<!-- END:nextjs-agent-rules -->