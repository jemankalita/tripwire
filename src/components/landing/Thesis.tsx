import Image from "next/image";
import { PulseLine } from "@/components/ui/PulseLine";
import { Reveal, RevealItem } from "./Reveal";

const TRACE = {
  changes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  failures: Array<number>(28).fill(0),
};

/** The idea in one picture: a seismograph draws a flat line until the ground really moves. */
export function Thesis() {
  return (
    <section aria-labelledby="thesis-heading" className="mx-auto grid max-w-[1376px] gap-x-12 gap-y-10 px-4 pt-[clamp(96px,12vw,180px)] sm:px-8 md:grid-cols-12">
      <Reveal className="md:col-span-7">
        <RevealItem>
          <figure>
            <div className="overflow-hidden rounded-[4px]">
              <Image
                src="/landing/richter.webp"
                alt="Seismologist Charles Richter reading a long paper seismograph log beside the recording drum"
                width={1400}
                height={1395}
                sizes="(min-width: 768px) 56vw, 100vw"
                className="block h-auto w-full transition-transform duration-[2400ms] ease-out hover:scale-[1.03]"
              />
            </div>
            <figcaption className="mt-3 text-[15px] text-muted">
              Charles Richter reading a seismograph log. Photo: Gil Cooper, Los Angeles Times,{" "}
              <a href="https://commons.wikimedia.org/w/index.php?curid=130379463" className="underline underline-offset-2 hover:text-ink">
                CC BY 4.0
              </a>
              , via Wikimedia Commons.
            </figcaption>
          </figure>
        </RevealItem>
      </Reveal>
      <Reveal className="order-first flex flex-col justify-end md:order-none md:col-span-5">
        <RevealItem>
          <h2 id="thesis-heading" className="text-[30px] leading-[1.1] font-medium tracking-[-0.03em]">
            Built like a seismograph.
          </h2>
        </RevealItem>
        <RevealItem>
          <p className="mt-4 text-[17px]">
            The pen draws a flat line for weeks. When the ground really moves there is one mark, and someone reads it. Tripwire gives every page you watch that same
            trace: flat while nothing matters, one spike when something does.
          </p>
        </RevealItem>
        <RevealItem>
          <div className="mt-8 [--changed:var(--accent)] [--faint:var(--muted)]">
            <PulseLine changes={TRACE.changes} failures={TRACE.failures} width={420} height={64} className="max-w-full" />
          </div>
        </RevealItem>
        <RevealItem>
          <figure className="mt-10">
            <div className="overflow-hidden rounded-[4px]">
              <Image
                src="/landing/milne-seismograph.webp"
                alt="A Milne horizontal pendulum seismograph in a museum case"
                width={1400}
                height={788}
                sizes="(min-width: 768px) 38vw, 100vw"
                className="block h-auto w-full"
              />
            </div>
            <figcaption className="mt-3 text-[15px] text-muted">
              Milne horizontal pendulum seismograph. Photo: Momotarou2012,{" "}
              <a href="https://commons.wikimedia.org/w/index.php?curid=23356547" className="underline underline-offset-2 hover:text-ink">
                CC BY-SA 3.0
              </a>
              , via Wikimedia Commons.
            </figcaption>
          </figure>
        </RevealItem>
      </Reveal>
    </section>
  );
}
