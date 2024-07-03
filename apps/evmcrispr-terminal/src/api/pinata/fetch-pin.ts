import "isomorphic-fetch";
import type { BareScript } from "../../types";

const fetchPin = async (
  pinataUrl: string,
  hashId?: string,
): Promise<BareScript | undefined> => {
  if (!hashId) return undefined;

  const url = pinataUrl + "/ipfs/" + hashId;

  try {
    const response = await fetch(url);

    if (response.status >= 400) {
      throw new Error("Bad response from server");
    }

    return response.json();
  } catch (_e) {
    throw new Error("Bad response from server");
  }
};

export default fetchPin;
