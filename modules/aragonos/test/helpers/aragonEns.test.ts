import { ComparisonType, NodeType } from '@1hive/evmcrispr';
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from '@1hive/evmcrispr-test-common';
import type { Signer } from 'ethers';

describe.concurrent('AragonOS > helpers > @aragonEns()', () => {
  let signer: Signer;
  const lazySigner = () => signer;

  beforeAll(async (ctx) => {
    [signer] = await ctx.file!.utils.getWallets();
  });

  it('should interpret it correctly', async () => {
    const [repoRes] = await preparingExpression(
      '@aragonEns(hooked-token-manager-no-controller.open.aragonpm.eth)',
      signer,
      'aragonos',
    );
    const [daoRes] = await preparingExpression(
      `@aragonEns(test.aragonid.eth)`,
      signer,
      'aragonos',
    );

    expect(await repoRes(), 'Repo address mismatch').to.equals(
      '0x7762A148DeA89C5099c0B14c260a2e24bB3AD264',
    );
    expect(await daoRes(), 'DAO address mismatch').to.equals(
      `0x380498cF5C188BAD479EFbc0Ea1eC40d49D5C58d`,
    );
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    '@aragonEns',
    ['mydao.aragonid.eth', '0x98Df287B6C145399Aaa709692c8D308357bC085D'],
    { type: ComparisonType.Between, minValue: 1, maxValue: 2 },
    lazySigner,
    'aragonos',
  );
});
