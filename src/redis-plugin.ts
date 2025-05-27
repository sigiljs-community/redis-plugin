import { Sigil, SigilPlugin } from "@sigiljs/sigil"
import { RedisClientOptions, RedisClientType } from "redis"
import * as redis from "redis"

export interface RedisPluginConfig {
  /** Redis client configuration options */
  clientOptions?: RedisClientOptions
  /** Redis connect URI */
  connectUri?: string
}

/**
 * Sigil plugin for integrating a redis interactions right into framework
 */
export default class RedisPlugin extends SigilPlugin<RedisPluginConfig> {
  public static name = "RedisPlugin"

  readonly #redisClient: RedisClientType<any, any, any, any, any>

  constructor() {
    super()

    this.#redisClient = redis.createClient({ url: this.$pluginConfig.connectUri, ...this.$pluginConfig.clientOptions })
    this.#redisClient.on("error", (err: any) => {
      this.logger({
        level: "error",
        message: `${ err.name }: ${ err.message || err.code }`,
        json: { name: err.name, message: err.message || err.code }
      })
    })

    Sigil.redis.attachClient(this.#redisClient)
  }

  public async onInitialize() {
    const at = performance.now()
    await this.#redisClient.connect()

    const consumed = performance.now() - at
    this.logger({
      level: "info",
      message: `Successfully connected to redis instance in ${ Math.round(consumed * 1000) / 1000 }ms`,
      json: { milestone: "connect", ok: true, time: consumed }
    })
  }

  public onBeforeExit(): Promise<any> | void {
    this.#redisClient.destroy()
  }
}