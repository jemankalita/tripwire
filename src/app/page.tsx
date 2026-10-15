import { diffTexts } from "@/core/diff";
import { Closing } from "@/components/landing/Closing";
import { Features } from "@/components/landing/Features";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LandingNav } from "@/components/landing/LandingNav";
import { Showcase } from "@/components/landing/Showcase";
import { Thesis } from "@/components/landing/Thesis";

// The watched view of the demo product page (price + stock), before and after.
const BEFORE = "$29.00\nSold out";
const AFTER = "$24.00\nIn stock";

export default function Home() {
  const priceHunk = diffTexts(BEFORE, AFTER).hunks[0];
  return (
    <>
      {/* Entrance animations start hidden; without script, show everything. */}
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <LandingNav />
      <main>
        <Hero priceHunk={priceHunk} />
        <Showcase priceHunk={priceHunk} />
        <Thesis />
        <HowItWorks />
        <Features />
        <Closing />
      </main>
    </>
  );
}
