import { Sigil } from "@sigiljs/sigil"
import RedisModelController from "./redis-model-controller"
import RedisPlugin, { RedisPluginConfig } from "./redis-plugin"

declare module "@sigiljs/sigil" {
  namespace Sigil {
    const redis: RedisModelController
  }
}

if (!("redis" in Sigil)) Object.defineProperty(Sigil, "redis", {
  value: new RedisModelController(),
  writable: false,
  configurable: false,
  enumerable: true
})

export {
  RedisPlugin,
  type RedisPluginConfig
}