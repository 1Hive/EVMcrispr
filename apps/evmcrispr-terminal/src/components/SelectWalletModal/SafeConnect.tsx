import { Button, HStack, Input, Text } from "@chakra-ui/react";
import { useState } from "react";

import { useTerminalStore } from "../../components/TerminalEditor/use-terminal-store";

export default function SafeConnect({ onConnect }: { onConnect: () => void }) {
  const [safeAddress, setSafeAddress] = useState("");
  const [attemptedConnect, setAttemptedConnect] = useState(false);
  const [chain, address] = safeAddress.split(":");
  const isValidSafeAddress =
    /\w+/g.test(chain) &&
    ((address?.startsWith("0x") && address?.length === 42) ||
      address?.endsWith(".eth"));
  const error =
    attemptedConnect && !isValidSafeAddress
      ? "Invalid Safe address. Example: 'gno:0x1234...5678' or 'eth:my-account.eth'"
      : null;

  const { title, script } = useTerminalStore();

  const url =
    `https://app.safe.global/apps/open?safe=${safeAddress}&appUrl=` +
    encodeURIComponent(
      `https://evmcrispr.com/#/terminal?title=${encodeURIComponent(title)}&script=${encodeURIComponent(script)}`,
    );
  return (
    <>
      <Input
        border={"1px solid"}
        borderColor={"green.300"}
        color={"white"}
        p={2.5}
        borderRadius={"none"}
        fontSize={"xl"}
        _placeholder={{
          color: "white",
          opacity: 1,
        }}
        _hover={{
          borderColor: "green.300",
        }}
        _focusVisible={{
          borderColor: "green.300",
          boxShadow: "none",
        }}
        autoFocus
        placeholder="Enter your Safe Address"
        value={safeAddress}
        onChange={(e) => {
          setSafeAddress(e.target.value);
          setAttemptedConnect(false);
        }}
      />
      <HStack justify={"center"} mt={4} mb={2}>
        <Button
          variant="overlay"
          size="sm"
          colorScheme="green"
          onClick={() => {
            setAttemptedConnect(true);
            if (isValidSafeAddress) {
              window.open(url, "_blank");
              onConnect();
            }
          }}
        >
          Connect Safe
        </Button>
      </HStack>
      {error && (
        <Text textAlign={"center"} color="red">
          {error}
        </Text>
      )}
    </>
  );
}
