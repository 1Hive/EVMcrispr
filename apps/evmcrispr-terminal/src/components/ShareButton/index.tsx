import { useNavigate } from "react-router-dom";
import { Icon, IconButton, Tooltip } from "@chakra-ui/react";
import { ShareIcon } from "@heroicons/react/24/solid";

import { useEffect, useState } from "react";

import useToast from "../../hooks/useToast";

import pinJSON from "../../api/pinata/pin-json";

type ShareButtonProps = {
  script: string;
  title: string;
};

export default function ShareButton({ script, title }: ShareButtonProps) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isLoading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setUrl("");
  }, [script]);

  async function handleShare() {
    const data = {
      title,
      script,
    };

    setLoading(true);
    try {
      const { IpfsHash: hash } = await pinJSON(data);
      const _url = `${window.location.origin}/#/terminal/${hash}`;
      setUrl(_url);
      navigator.clipboard.writeText(_url);
      toast({
        description: "The link is copied to the clipboard",
        status: "success",
      });
      setLoading(false);
      navigate(`/terminal/${hash}`, { replace: true });
    } catch (_e) {
      toast({
        description: "The script could not be saved to IPFS",
        status: "error",
      });
      setLoading(false);
    }
  }

  return (
    <>
      <Tooltip
        label={
          title
            ? url
              ? "Link copied to clipboard!"
              : "Generate link"
            : "The script needs a title first"
        }
        variant={title ? "" : "warning"}
        closeOnClick={false}
        placement="top"
      >
        <IconButton
          icon={<Icon as={ShareIcon} />}
          aria-label={"Share script"}
          variant={"outline-overlay"}
          onClick={handleShare}
          size={"md"}
          isLoading={isLoading}
          disabled={!!url || !title}
        />
      </Tooltip>
    </>
  );
}
