import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../src/application/services/auth.service";

test("senha administrativa é armazenada com hash e validada sem texto puro", async () => {
  const hash = await AuthService.hashPassword("teste123");
  assert.notEqual(hash, "teste123");
  assert.equal(await AuthService.verifyPassword("teste123", hash), true);
  assert.equal(await AuthService.verifyPassword("incorreta", hash), false);
});
