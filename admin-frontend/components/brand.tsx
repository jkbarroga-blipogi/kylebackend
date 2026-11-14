import Image from "next/image";

export function Brand() {
  return (
    <div className="brand">
      <Image src="/mark.svg" alt="" width={40} height={40} />
      <div>
        <span className="brand-name" translate="no">Animal</span>
        <span className="brand-description">Shelter administration</span>
      </div>
    </div>
  );
}
