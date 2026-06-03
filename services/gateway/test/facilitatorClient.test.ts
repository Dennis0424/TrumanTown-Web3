import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { httpFacilitator } from '../src/facilitatorClient.js';
import { X402_VERSION, type PaymentPayload, type PaymentRequirements } from '../src/x402.js';

let server: Server;
let baseUrl: string;
let lastBody: any;

const payload = { x402Version: X402_VERSION, scheme: 'exact', network: 'base-sepolia', payload: { signature: '0x', authorization: { from: '0xa', to: '0xb', value: '1', validAfter: '0', validBefore: '9', nonce: '0x1' } } } as PaymentPayload;
const requirements = { scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '10000', resource: 'r', description: 'd', mimeType: 'application/json', payTo: '0xb', maxTimeoutSeconds: 120, asset: '0xusdc' } as PaymentRequirements;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      lastBody = JSON.parse(raw || '{}');
      res.setHeader('content-type', 'application/json');
      if (req.url === '/verify') res.end(JSON.stringify({ isValid: true, payer: '0xa' }));
      else if (req.url === '/settle') res.end(JSON.stringify({ success: true, transaction: '0xtx', payer: '0xa' }));
      else { res.statusCode = 404; res.end('{}'); }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('httpFacilitator', () => {
  it('verify posts x402 envelope and parses response', async () => {
    const f = httpFacilitator(baseUrl);
    const res = await f.verify(payload, requirements);
    expect(res).toEqual({ isValid: true, payer: '0xa' });
    expect(lastBody).toEqual({ x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: requirements });
  });

  it('settle posts x402 envelope and parses response', async () => {
    const f = httpFacilitator(baseUrl);
    const res = await f.settle(payload, requirements);
    expect(res).toEqual({ success: true, transaction: '0xtx', payer: '0xa' });
  });

  it('throws on non-2xx', async () => {
    const f = httpFacilitator(`${baseUrl}/nope`);
    await expect(f.verify(payload, requirements)).rejects.toThrow();
  });
});
