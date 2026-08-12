import './App.css'

function App() {
  return (
    <div className="container">
      <header>
        <h1>Min Hyeong Kim</h1>
        <p className="subtitle">M.S. Student · Human-Computer Interaction Lab, Seoul National University</p>
        <p className="contact">
          <a href="mailto:mhkim@hcil.snu.ac.kr">mhkim@hcil.snu.ac.kr</a>
          {' · '}
          <a href="https://hcil.snu.ac.kr/people/min-hyeong-kim" target="_blank" rel="noreferrer">HCIL Profile</a>
        </p>
      </header>

      <section>
        <p>
          I am an M.S. student in Computer Science and Engineering at Seoul National University,
          advised by <a href="https://hcil.snu.ac.kr" target="_blank" rel="noreferrer">Prof. Jinwook Seo</a>.
          My research interests lie in <strong>information visualization</strong> and <strong>human-computer interaction</strong>.
        </p>
      </section>

      <section>
        <h2>Publications</h2>

        <h3>Full Papers</h3>
        <ol className="pub-list">
          <li>
            Yungun Kim, <strong>Min Hyeong Kim</strong>, Suyeon Hwang, Gahyun Kim, Seokweon Jung, Hyeon Jeon, Jinwook Seo.
            {' '}Democratizing Extensive Reading by Tailoring Web Contents.
            {' '}<em>39th Annual ACM Symposium on User Interface Software and Technology (UIST '26)</em>, Detroit, USA, 2026.
          </li>
          <li>
            Kiroong Choe, Eunhye Kim, <strong>Min Hyeong Kim</strong>, Suyeon Hwang, Sangwon Park, Nam Wook Kim, Jinwook Seo.
            {' '}CrossLit: Connecting Visual and Textual Sensemaking for Literature Review.
            {' '}<em>2026 CHI Conference on Human Factors in Computing Systems (CHI '26)</em>, Barcelona, Spain, 2026.
          </li>
        </ol>

        <h3>Short Papers &amp; Workshops</h3>
        <ol className="pub-list">
          <li>
            Seokweon Jung, <strong>Min Hyeong Kim</strong>, Hyeon Jeon, Jinwook Seo.
            {' '}Readability vs. Faithfulness: Unveiling Correlations between Graph Aesthetics and DR Quality.
            {' '}<em>EuroVis 2026 GDxDR Workshop</em>, Nottingham, UK, 2026.
          </li>
          <li>
            Jeongin Park, Mingyu An, Hyunseo Yang, Junhyeong Hwangbo, <strong>Min Hyeong Kim</strong>, Hyeon Jeon, Jinwook Seo.
            {' '}DirectVis: Editing Code-Based Interactive Visualization with Direct Manipulation.
            {' '}<em>IEEE Pacific Visualization Conference (PacificVis)</em>, Sydney, Australia, 2026.
          </li>
          <li>
            <strong>Min Hyeong Kim</strong>, Yumin Song, Yungun Kim, Aeri Cho, Soohyun Lee, Hyeon Jeon, Jinwook Seo.
            {' '}Automated Pipeline for Detecting and Analyzing Misleading Visual Elements.
            {' '}<em>IEEE Pacific Visualization Conference (PacificVis)</em>, Taipei City, Taiwan, 2025.
          </li>
          <li>
            <strong>Min-Hyeong Kim</strong>, Minje Lee, Siwoo Song, Kunsoo Park.
            {' '}Comparison of State-of-the-Art Algorithms for Graph Isomorphism.
            {' '}<em>KIISE Transactions on Computing Practices</em>, Vol. 29, No. 12, 2023. (in Korean)
          </li>
        </ol>
      </section>

      <section>
        <h2>Education</h2>
        <div className="entry">
          <div className="entry-header">
            <span>M.S. in Computer Science and Engineering, Seoul National University</span>
            <span className="date">2025.03 – Present</span>
          </div>
          <div className="entry-body">Advisor: Prof. Jinwook Seo</div>
        </div>
        <div className="entry">
          <div className="entry-header">
            <span>B.S. in Computer Science and Engineering &amp; B.A. in Geography, Seoul National University</span>
            <span className="date">2020.03 – 2025.02</span>
          </div>
          <div className="entry-body">GPA: 3.96/4.30, Graduated Summa Cum Laude</div>
        </div>
      </section>

      <section>
        <h2>Experience</h2>
        <div className="entry">
          <div className="entry-header">
            <span>Undergraduate Intern, Human-Computer Interaction Lab, SNU</span>
            <span className="date">2024.01 – 2025.02</span>
          </div>
          <div className="entry-body">Advised by Prof. Jinwook Seo · HCI, Information Visualization</div>
        </div>
        <div className="entry">
          <div className="entry-header">
            <span>UROP, Computer Theory and Applications Lab, SNU</span>
            <span className="date">2022.09 – 2022.12</span>
          </div>
          <div className="entry-body">Advised by Prof. Kunsoo Park · Graph Isomorphism Algorithms</div>
        </div>
      </section>

      <section>
        <h2>Awards &amp; Honors</h2>
        <div className="entry">
          <div className="entry-header">
            <span>Best Bachelor's Thesis Presentation Award, CSE, Seoul National University</span>
            <span className="date">2025.02</span>
          </div>
        </div>
        <div className="entry">
          <div className="entry-header">
            <span>Best Volunteer Award, Seoul National University</span>
            <span className="date">2023.12</span>
          </div>
        </div>
        <div className="entry">
          <div className="entry-header">
            <span>Best Presentation Award, Korea Computer Congress</span>
            <span className="date">2023.07</span>
          </div>
        </div>
      </section>

      <section>
        <h2>Grants &amp; Fellowships</h2>
        <div className="entry">
          <div className="entry-header">
            <span>AI Seoul Tech Fellowship (KRW 20M), Seoul Future Foundation</span>
            <span className="date">2026.06</span>
          </div>
        </div>
      </section>

      <section>
        <h2>Services</h2>
        <div className="entry">
          <div className="entry-header">
            <span>TA · Information Visualization and Visual Analytics (M1522.000500), SNU</span>
            <span className="date">2025 Fall</span>
          </div>
        </div>
      </section>

      <footer>
        <p>Last updated: August 2026</p>
      </footer>
    </div>
  )
}

export default App
