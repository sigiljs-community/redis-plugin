import RedisModelController from "./redis-model-controller"
import RedisPlugin, { RedisPluginConfig } from "./redis-plugin"

declare module "@sigiljs/sigil" {
  namespace Sigil {
    const redis: RedisModelController
  }
}

export {
  RedisPlugin,
  type RedisPluginConfig
}