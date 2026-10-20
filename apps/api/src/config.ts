export function readConfig() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || !/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) throw new Error('Set a valid MONGODB_URI in .env (see .env.example).');
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  return { mongoUri, port };
}
