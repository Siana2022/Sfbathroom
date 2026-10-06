import { manejarPeticion } from '../../../mcp/src/http-mcp';

export default async function handler(req: any, res: any): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  const p = {
    method: req.method as string | undefined,
    authorization: (req.headers?.authorization ?? '') as string,
    bodyText: Buffer.concat(chunks).toString('utf8'),
  };
  const r = await manejarPeticion(p);
  res.status(r.status);
  for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
  res.send(r.body);
}