import { namehash as _namehash } from "viem";
import { normalize } from "viem/ens";

import type { HelperFunction } from "../../../types";
import { ComparisonType, checkArgsLength } from "../../../utils";
import type { Std } from "../Std";

export const namehash: HelperFunction<Std> = async (
  _,
  h,
  { interpretNodes },
): Promise<string> => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const [name] = await interpretNodes(h.args);

  try {
    normalize(name);
    return _namehash(name);
  } catch (_e) {
    throw new Error(
      "Invalid ENS name. Please check the value you are passing to @namehash",
    );
  }
};
