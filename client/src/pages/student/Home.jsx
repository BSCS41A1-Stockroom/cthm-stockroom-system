import "../../styles/home.css";

import Hero from "../../components/student/home/Hero";
import FeatureCards from "../../components/student/home/FeatureCards";
import AnnouncementSection from "../../components/student/home/AnnouncementSection";

export default function Home() {

  return (

    <main className="home-page">

      <Hero />

      <FeatureCards />

      <AnnouncementSection />

    </main>

  );

}