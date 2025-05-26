# Sigil Redis Plugin

Plugin for SigilJS framework that provides template-based Redis interactions


## Installation

```bash
npm install @sigiljs-community/redis-plugin
# or
yarn add @sigiljs-community/redis-plugin
```


## Usage

**Import and register the plugin**

```typescript
import { Sigil } from "@sigiljs/sigil"
import { RedisPlugin } from "@sigiljs-community/redis-plugin"

const app = new Sigil()

// Register the plugin with optional settings
app.addPlugin(RedisPlugin, {
  /**
   * Redis connect URI
   */
  connectUri: "redis://localhost:6379",

  /**
   * Redis client options, you can read more about it
   * in the redis SDK documentation
   */
  clientOptions: {}
})
```

**Define templates and schemas**

_Note: for templates, redis plugin uses `seal`, so you can create
templates by your own, without `defineTemplate` helper_

> We strongly recommend avoiding the use of `optional` 
> schemas in templates as this may invalidate 
> schemas due to missing parameters, 
> use `nullable` schemas instead

```typescript
// Example route with validation
import { Sigil, seal } from "@sigiljs/sigil"

const template = Sigil.redis.defineTemplate({
  userId: seal.string,
  userName: seal.string.nullable
})

const userSchema = Sigil.redis.defineSchema(template, {
  // Optional, time in seconds after which record
  // will be deleted, default - undefined
  ttl: 120,
  // Optional, if true, will automatically remove
  // record after first read, default - false
  readOnce: true,
  // Optional, define custom namespace name for
  // current schema. If not set, namespace
  // will be automatically generated
  namespace: "CoolNS"
})

```

**Set, get or delete records using schema**

> Note: any redis operations should be performed **only** after
> Sigil application starts listening

Using set, set with random key and get:
```typescript
const key = await userSchema.set("key1", {
  userId: "1234567890"
})

// Or you can insert entry with random key
const randKey = await userSchema.randomKey.set({
  userId: "1234567890"
})

const entry = await userSchema.get(randKey) // => { userId: ... }
```

Using helpers:
```typescript
userSchema.with("myKey", entry => {
  // This code will be executed only if
  // myKey found and valid
})
```

## License

You can copy and paste the MIT license summary from below.

```text
MIT License

Copyright (c) 2022 Kurai Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

