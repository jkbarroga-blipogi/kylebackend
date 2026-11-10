import Image from "next/image";
import { Heart } from "lucide-react";

export function AuthWelcome() {
  return (
    <section aria-label="About Barroga" className="auth-story">
      <Image
        src="/login-companions.webp"
        alt=""
        width={1086}
        height={1448}
        sizes="(min-width: 1024px) 50vw, 100vw"
        preload
        className="auth-story-image"
      />
      <div className="auth-story-brand">
        <Image src="/mark.svg" alt="" width={36} height={36} />
        <span className="text-sm font-semibold tracking-tight">
          Animal
          <span className="mt-0.5 block text-[10px] font-normal tracking-normal text-muted-foreground">Shelter management</span>
        </span>
      </div>
      <div className="auth-story-content">
        <h2 aria-label="A little care. A better tomorrow.">
          <span className="auth-story-initial" aria-hidden="true">A</span>
          <span className="auth-story-lines" aria-hidden="true">
            <span>little care.</span>
            <span>better <span className="auth-story-accent">tomorrow.</span></span>
          </span>
        </h2>
        <p className="auth-story-description">A safe start. A little love. A place to belong.</p>
      </div>
      <div className="auth-story-footer">
        <span className="auth-story-heart"><Heart size={18} aria-hidden="true" /></span>
        <p>For every paw.<br /><strong>For every new beginning.</strong></p>
      </div>
    </section>
  );
}
