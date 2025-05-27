import { ArraySchema, BasePrimitive, NullableSchema, ObjectSchema, seal } from "@sigiljs/seal"
import { InferSchema } from "@sigiljs/seal/types"
import { Sigil } from "@sigiljs/sigil"
import { jsonStringify } from "@sigiljs/sigil/utils"
import { createHash } from "node:crypto"
import { RedisClientType } from "redis"
import sealJsonParser from "./utils/seal-json-parser"
import * as crypto from "crypto"

type RedisTemplate = BasePrimitive<any>
  | ArraySchema<BasePrimitive<any> | NullableSchema<BasePrimitive<any>>>
  | NullableSchema<BasePrimitive<any>>
  | ObjectSchema<any>

interface RedisSchemaOptions {
  /** Time in seconds after which record will be deleted */
  ttl?: number
  /** If true, will delete record after first read */
  readOnce?: boolean
  /** Manually set namespace for schema */
  namespace?: string
}

/**
 * Executor class that handles serialization, compression,
 * and interactions with Redis for a given schema template.
 */
class RedisSchemaExecutor<T extends RedisTemplate> {
  protected client: () => RedisClientType<any, any, any, any, any>

  constructor(
    client: () => RedisClientType<any, any, any, any, any>,
    protected readonly template: T,
    protected readonly options: Required<Omit<RedisSchemaOptions, "ttl">> & { ttl?: number }
  ) {
    this.client = client
  }

  /**
   * Compresses and writes the specified value to Redis.
   *
   * @param key key under which the value will be stored (without namespace).
   * @param value value to store.
   * @returns key used in Redis (without namespace).
   */
  public async set(key: string, value: InferSchema<T>): Promise<string> {
    await this.waitInitialization()
    const serializedValue = jsonStringify(this.serialize(value), { throw: true })
    if (typeof this.options.ttl === "number") {
      this.client().setEx(this.fullKey(key), this.options.ttl, serializedValue)
    }
    else this.client().set(this.fullKey(key), serializedValue)

    return key
  }

  /**
   * Retrieves data from Redis and validates it against the template.
   *
   * @param key key in Redis (without namespace).
   * @param force if true, throws an error instead of returning null when
   * data is missing or fails validation.
   * @returns parsed data matching the template, or null if not in force mode.
   */
  public async get<F extends boolean | undefined>(key: string, force?: F): Promise<F extends true ? InferSchema<T> : InferSchema<T> | null> {
    await this.waitInitialization()
    const rawValue = await this.client().get(this.fullKey(key))
    if (!rawValue) {
      if (force) throw new Error(`Key ${ key } not found`)

      return null as any
    }

    if (this.options.readOnce) this.delete(key)

    return sealJsonParser(Buffer.isBuffer(rawValue) ? rawValue.toString("utf8") : rawValue, this.template) as any
  }

  /**
   * Deletes the specified key from Redis.
   *
   * @param key key to delete (without namespace).
   * @returns result of the deletion operation.
   */
  public async delete(key: string) {
    await this.waitInitialization()
    return this.client().del(key)
  }

  /**
   * Retrieves data from Redis and executes a callback if the data exists
   * and matches the template.
   *
   * @param key key to retrieve.
   * @param callback function to execute with the retrieved payload.
   * @returns callback result or null if no data.
   */
  public async with<R extends any>(key: string, callback: (payload: InferSchema<T>) => R): Promise<R | null> {
    const payload = await this.get(key)
    if (payload) return callback(payload)
    return null
  }

  /**
   * Provides a method to set a value with an auto-generated random key.
   */
  public get randomKey() {
    const executor = this
    return {
      /**
       * Compresses and writes the value under a random key.
       *
       * @param value value to store.
       * @returns generated Redis key (without namespace).
       */
      set(value: InferSchema<T>): Promise<string> {
        const key = crypto.randomBytes(Sigil.redis.randomKeyBytesCount || 16).toString("base64url")
        return executor.set(key, value)
      }
    }
  }

  private fullKey(key: string) {
    return this.options.namespace + "+" + key
  }

  private serialize(payload: any): Array<any> {
    if (typeof payload !== "object") return payload

    const schemaShapeKeys = Object.keys(seal.exportMetadataOf(this.template).shape || {})
    if (schemaShapeKeys.length) {
      const response: any[] = []
      for (const key of schemaShapeKeys) {
        const v = payload[key]
        response.push((v && typeof v === "object") ? this.serialize(v) : v)
      }
      return response
    }

    return Object.values(payload).map(v => (v && typeof v === "object") ? this.serialize(v) : v)
  }

  /**
   * Returns a promise that resolves when redis client is ready
   */
  private async waitInitialization() {
    if (this.client().isReady) return

    let attempt = 0
    return new Promise<void>(resolve => {
      const interval = setInterval(() => {
        attempt += 1
        if (attempt > 300) {
          clearInterval(interval)
          throw new Error("Redis initialization timeout, if this is only error you encounter, double-check that Sigil" +
            " app starts listening BEFORE any redis interactions")
        }

        if (!this.client().isReady) return

        clearInterval(interval)
        resolve()
      }, 100)
    })
  }
}

/**
 * Schema class responsible for metadata handling, and read/write to Redis.
 *
 * If `namespace` is not provided in options, it is generated automatically:
 *
 * ```ts
 * const namespace = createHash("shake256", { outputLength: 8 })
 *   .update(jsonStringify([seal.exportMetadataOf(template), options || {}], { throw: true }))
 *   .digest("base64url")
 * ```
 */
class RedisSchema<T extends RedisTemplate> extends RedisSchemaExecutor<T> {
  /**
   * @param client redis client instance
   * @param template seal schema template
   * @param options schema options
   */
  constructor(client: () => RedisClientType<any, any, any, any, any>, template: T, options?: RedisSchemaOptions) {
    const namespace = options?.namespace ?? createHash("shake256", { outputLength: 8 })
      .update(jsonStringify([seal.exportMetadataOf(template), options || {}], { throw: true }))
      .digest("base64url")

    const requiredOptions = {
      ttl: options?.ttl,
      readOnce: options?.readOnce ?? false,
      namespace
    }

    super(client, template, requiredOptions)
  }
}

/**
 * Redis controller
 */
export default class RedisModelController {
  public randomKeyBytesCount = 16

  private client!: RedisClientType<any, any, any, any, any>

  constructor(client?: RedisClientType<any, any, any, any, any>) {
    if (client) this.client = client
  }

  /**
   * Creates a new object schema template compatible with Seal.
   *
   * @param template schema definition.
   * @returns an ObjectSchema based on the provided template.
   */
  public defineTemplate<T extends { [key: string]: RedisTemplate }>(template: T): ObjectSchema<T> {
    return seal.object(template)
  }

  public attachClient(client: RedisClientType<any, any, any, any, any>) {
    this.client = client
  }

  /**
   * Defines a new data schema with the given template and options.
   *
   * If `name` is provided in options, the schema is stored globally
   * and can be later retrieved by name.
   *
   * @example
   * const schema = Sigil.redis.defineSchema(template, { name: "MyCoolSchema" })
   * const retrieved = Sigil.redis.schema<...>("MyCoolSchema")
   *
   * @param template redis schema template.
   * @param options schema options.
   * @returns a RedisSchema instance for data operations.
   */
  public defineSchema<T extends RedisTemplate>(template: T, options?: RedisSchemaOptions): RedisSchema<T> {
    return new RedisSchema(() => this.client, template, options)
  }

  /**
   * Disconnects and cleans up the Redis client.
   */
  public destroyClient() {
    this.client.destroy()
  }
}
