# codebase

To install dependencies:

```bash
bun install
```


To init barkcode.json:

```bash
bun run index.ts init
```

To run:
```bash
bun run index.ts run 
```

To run with debug:
```bash
bun run index.ts run --debug
```

To run with spawn:
14 seems to be the max number of processes that can be spawned.
``` bash
bun run .\index.ts run --spawn=14
```
