import dotenv from "dotenv";
import { Redis } from '@upstash/redis'

dotenv.config();

const redisUrl=process.env.UPSTASH_REDIS_REST_URL;
const redisToken=process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
})