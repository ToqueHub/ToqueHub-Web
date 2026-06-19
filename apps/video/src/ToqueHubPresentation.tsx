import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";

type Scene = {
  id: string;
  start: number;
  end: number;
  caption: string;
  eyebrow?: string;
};

const FPS = 30;

const scenes: Scene[] = [
  {
    id: "chaos",
    start: 0,
    end: 12,
    eyebrow: "Avant ToqueHub",
    caption:
      "Dans beaucoup de cuisines, la gestion repose encore sur des fichiers Excel, des feuilles papier et des informations dispersées.",
  },
  {
    id: "origin",
    start: 12,
    end: 22,
    eyebrow: "L'origine",
    caption:
      "ToqueHub est né d'un constat simple: un cuisinier qui en avait assez de perdre du temps avec des outils qui ne parlent pas le langage du terrain.",
  },
  {
    id: "logo",
    start: 22,
    end: 30,
    eyebrow: "La promesse",
    caption:
      "Enfin un ERP moderne conçu par des professionnels de la restauration, pour les professionnels de la restauration.",
  },
  {
    id: "onboarding",
    start: 30,
    end: 40,
    eyebrow: "Demarrage",
    caption:
      "En quelques minutes, l'etablissement cree son environnement local: organisation, site principal, administrateur et identité.",
  },
  {
    id: "catalog",
    start: 40,
    end: 50,
    eyebrow: "Plateforme modulaire",
    caption:
      "Chaque cuisine active uniquement les applications dont elle a besoin, tout en gardant une seule base de donnees commune.",
  },
  {
    id: "stocks",
    start: 50,
    end: 60,
    eyebrow: "Stocks",
    caption:
      "Produits, fournisseurs, emplacements, inventaires et mouvements: le stock devient tracable, lisible et partage.",
  },
  {
    id: "technical",
    start: 60,
    end: 69,
    eyebrow: "Fiches techniques",
    caption:
      "Les fiches techniques utilisent les produits du stock pour calculer les couts matiere, les portions, les allergenes et la production theorique.",
  },
  {
    id: "rnm",
    start: 69,
    end: 76,
    eyebrow: "Cours des produits",
    caption:
      "Avec les donnees RNM FranceAgriMer, ToqueHub aide a suivre les prix du marche et les tendances des denrees alimentaires.",
  },
  {
    id: "operations",
    start: 76,
    end: 84,
    eyebrow: "Operations",
    caption:
      "Planning, RH, utilisateurs et permissions structurent l'organisation sans recreer les memes informations partout.",
  },
  {
    id: "final",
    start: 84,
    end: 90,
    eyebrow: "Vision",
    caption:
      "ToqueHub: toutes les donnees de votre cuisine dans une seule plateforme, hebergee chez vous.",
  },
];

const palette = {
  background: "#080b11",
  glass: "rgba(15, 23, 42, 0.93)",
  glassBorder: "rgba(255, 255, 255, 0.08)",
  ink: "#f8fafc",
  muted: "#94a3b8",
  emerald: "#10b981",
  emeraldGlow: "rgba(16, 185, 129, 0.15)",
  blue: "#3b82f6",
  blueGlow: "rgba(59, 130, 246, 0.15)",
  amber: "#f59e0b",
  amberGlow: "rgba(245, 158, 11, 0.15)",
  rose: "#f43f5e",
  roseGlow: "rgba(244, 63, 94, 0.15)",
  charcoal: "#1e293b",
};

function seconds(value: number) {
  return value * FPS;
}

function sceneOpacity(frame: number, scene: Scene) {
  const start = seconds(scene.start);
  const end = seconds(scene.end);
  return Math.min(
    interpolate(frame, [start, start + 18], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }),
    interpolate(frame, [end - 16, end], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.7, 0, 0.84, 0),
    }),
  );
}

function currentScene(frame: number) {
  const second = frame / FPS;
  return scenes.find((scene) => second >= scene.start && second < scene.end) ?? scenes[0];
}

function localFrame(frame: number, scene: Scene) {
  return Math.max(0, frame - seconds(scene.start));
}

function appear(frame: number, delay = 0, distance = 24) {
  const opacity = interpolate(frame, [delay, delay + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const y = interpolate(frame, [delay, delay + 28], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return { opacity, transform: `translateY(${y}px)` };
}

function slide(frame: number, delay = 0, from = 80) {
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = interpolate(frame, [delay, delay + 30], [from, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return { opacity, transform: `translateX(${x}px)` };
}

export function ToqueHubPresentation() {
  const frame = useCurrentFrame();
  const active = currentScene(frame);
  const progress = frame / seconds(90);

  return (
    <AbsoluteFill style={styles.stage}>
      <BackgroundGrid progress={progress} />
      {scenes.map((scene) => {
        const opacity = sceneOpacity(frame, scene);
        if (opacity <= 0.001) return null;
        return (
          <AbsoluteFill key={scene.id} style={{ opacity }}>
            <SceneRenderer id={scene.id} frame={localFrame(frame, scene)} />
          </AbsoluteFill>
        );
      })}
      <BrandChrome activeSceneId={active.id} />
      <CaptionBar scene={active} progress={progress} />
    </AbsoluteFill>
  );
}

export function Thumbnail() {
  return (
    <AbsoluteFill style={styles.stage}>
      <BackgroundGrid progress={0.22} />
      <FinalLockup frame={45} thumbnail />
    </AbsoluteFill>
  );
}

function SceneRenderer({ id, frame }: { id: string; frame: number }) {
  switch (id) {
    case "chaos":
      return <ChaosScene frame={frame} />;
    case "origin":
      return <OriginScene frame={frame} />;
    case "logo":
      return <LogoScene frame={frame} />;
    case "onboarding":
      return <OnboardingScene frame={frame} />;
    case "catalog":
      return <CatalogScene frame={frame} />;
    case "stocks":
      return <StocksScene frame={frame} />;
    case "technical":
      return <TechnicalSheetsScene frame={frame} />;
    case "rnm":
      return <RnmScene frame={frame} />;
    case "operations":
      return <OperationsScene frame={frame} />;
    default:
      return <FinalScene frame={frame} />;
  }
}

function BackgroundGrid({ progress }: { progress: number }) {
  const shift = progress * 120;
  const x1 = 30 + Math.sin(progress * Math.PI * 2) * 15;
  const y1 = 20 + Math.cos(progress * Math.PI * 2) * 10;
  const x2 = 70 - Math.sin(progress * Math.PI * 2) * 15;
  const y2 = 80 - Math.cos(progress * Math.PI * 2) * 10;

  return (
    <AbsoluteFill
      style={{
        background: palette.background,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: `${y1}%`,
          left: `${x1}%`,
          width: 900,
          height: 900,
          borderRadius: 999,
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(8, 11, 17, 0) 70%)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: `${y2}%`,
          left: `${x2}%`,
          width: 1000,
          height: 1000,
          borderRadius: 999,
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.14) 0%, rgba(8, 11, 17, 0) 70%)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "80%",
          left: "50%",
          width: 700,
          height: 700,
          borderRadius: 999,
          background: "radial-gradient(circle, rgba(244, 63, 94, 0.08) 0%, rgba(8, 11, 17, 0) 70%)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.14,
          backgroundImage:
            "linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          transform: `translate(${-shift}px, ${-shift * 0.4}px)`,
        }}
      />
      <div style={styles.topBand} />
      <div style={styles.bottomBand} />
    </AbsoluteFill>
  );
}

function BrandChrome({ activeSceneId }: { activeSceneId: string }) {
  return (
    <>
      <div style={styles.brandTop}>
        <BrandMark small />
        <span>ERP open source pour cuisines professionnelles</span>
      </div>
      <div style={styles.timeline}>
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId;
          return (
            <div
              key={scene.id}
              style={{
                flex: scene.end - scene.start,
                background: isActive
                  ? `linear-gradient(90deg, ${palette.emerald}, ${palette.blue})`
                  : "rgba(255, 255, 255, 0.08)",
                borderRadius: 999,
                boxShadow: isActive ? "0 0 16px rgba(16, 185, 129, 0.4)" : "none",
                transition: "all 0.4s ease",
              }}
            />
          );
        })}
      </div>
    </>
  );
}

function CaptionBar({ scene, progress }: { scene: Scene; progress: number }) {
  return (
    <div style={styles.captionWrap}>
      <div style={styles.captionMeta}>
        <span style={{
          background: `linear-gradient(135deg, ${palette.emerald}, ${palette.blue})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          fontWeight: 900,
        }}>{scene.eyebrow}</span>
        <span>{Math.round(progress * 90)}s / 90s</span>
      </div>
      <div style={styles.captionText}>{scene.caption}</div>
    </div>
  );
}

function ChaosScene({ frame }: { frame: number }) {
  const sheets = [
    { title: "Inventaire Juin.xlsx", color: palette.emerald, x: 200, y: 180, r: -8, phase: 0 },
    { title: "Fiches techniques v12.xlsx", color: palette.amber, x: 650, y: 130, r: 6, phase: 1.5 },
    { title: "Planning papier", color: palette.blue, x: 1080, y: 210, r: -3, phase: 3.1 },
    { title: "Prix fournisseurs.pdf", color: palette.rose, x: 430, y: 520, r: 5, phase: 4.5 },
    { title: "DLC chambre froide", color: palette.charcoal, x: 980, y: 560, r: -7, phase: 2.2 },
  ];
  return (
    <SceneShell>
      <div style={{ ...styles.largeCopy, ...appear(frame, 5) }}>
        <Kicker>Le probleme</Kicker>
        <h1 style={styles.h1}>Des informations partout.</h1>
        <p style={styles.lead}>Des decisions importantes dans des fichiers qui ne se parlent pas.</p>
      </div>
      {sheets.map((sheet, index) => {
        const floatY = Math.sin(frame * 0.04 + sheet.phase) * 12;
        const floatX = Math.cos(frame * 0.03 + sheet.phase) * 8;
        const rotateZ = sheet.r + Math.sin(frame * 0.02 + sheet.phase) * 2;
        const appearance = appear(frame, 12 + index * 5);
        return (
          <SpreadsheetCard
            key={sheet.title}
            title={sheet.title}
            color={sheet.color}
            style={{
              left: sheet.x + floatX,
              top: sheet.y + floatY,
              transform: `${appearance.transform} rotate(${rotateZ}deg) perspective(1000px) rotateX(10deg) rotateY(-5deg)`,
              opacity: appearance.opacity,
            }}
          />
        );
      })}
    </SceneShell>
  );
}

function OriginScene({ frame }: { frame: number }) {
  return (
    <SceneShell>
      <div style={{ ...styles.storyPanel, ...appear(frame, 0) }}>
        <Kicker>L'histoire</Kicker>
        <h1 style={styles.h1}>Un cuisinier. Un besoin reel.</h1>
        <p style={styles.lead}>
          ToqueHub part du terrain: les receptions, les couts matiere, les plannings, les fiches techniques et les equipes.
        </p>
      </div>
      <div
        style={{
          ...styles.chefBoard,
          ...slide(frame, 12, 120),
          transform: `${slide(frame, 12, 120).transform} perspective(1200px) rotateY(-10deg)`,
        }}
      >
        <div style={styles.boardHeader}>
          <span>Service du midi</span>
          <strong style={{ color: palette.emerald, textShadow: "0 0 12px rgba(16, 185, 129, 0.4)" }}>12:03</strong>
        </div>
        <div style={styles.ticketGrid}>
          {["Reception legumes", "Prix beurre en hausse", "Fiche sauce tomate", "Remplacement soir", "Inventaire froid"].map(
            (item, index) => (
              <div
                key={item}
                style={{
                  ...styles.ticket,
                  borderLeftColor: [palette.emerald, palette.amber, palette.rose, palette.blue, palette.charcoal][index],
                  opacity: appear(frame, 18 + index * 4).opacity,
                  transform: appear(frame, 18 + index * 4).transform,
                }}
              >
                <span>{item}</span>
                <small style={{
                  color: index % 2 ? palette.amber : palette.rose,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
                  {index % 2 ? "a verifier" : "urgent"}
                </small>
              </div>
            ),
          )}
        </div>
      </div>
    </SceneShell>
  );
}

function LogoScene({ frame }: { frame: number }) {
  const logoScale = interpolate(frame, [0, 30], [0.8, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  }) + Math.sin(frame * 0.05) * 0.015;

  return (
    <SceneShell center>
      <div style={{
        ...styles.lockup,
        ...appear(frame, 0, 42),
        transform: `${appear(frame, 0, 42).transform} scale(${logoScale})`,
      }}>
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute",
            inset: -50,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, rgba(59, 130, 246, 0.35) 30%, rgba(8, 11, 17, 0) 70%)",
            opacity: Math.sin(frame * 0.08) * 0.3 + 0.7,
            zIndex: -1,
          }} />
          <BrandMark />
        </div>
        <h1 style={{
          ...styles.heroTitle,
          background: `linear-gradient(135deg, #ffffff, #94a3b8)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>ToqueHub</h1>
        <p style={styles.heroSub}>Le systeme d'exploitation open source des cuisines professionnelles.</p>
      </div>
      <div style={{ ...styles.promiseStrip, ...appear(frame, 38) }}>
        {["Restaurant", "EHPAD", "Collectivite", "Traiteur", "Hotel-restaurant"].map((text, idx) => (
          <span
            key={text}
            style={{
              padding: "10px 20px",
              borderRadius: 999,
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: 20,
              fontWeight: 800,
              color: palette.muted,
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
              transform: `scale(${interpolate(frame, [38 + idx * 4, 38 + idx * 4 + 12], [0.8, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})`,
            }}
          >
            {text}
          </span>
        ))}
      </div>
    </SceneShell>
  );
}

function OnboardingScene({ frame }: { frame: number }) {
  return (
    <ProductScene frame={frame} title="Creer son environnement" text="Organisation, site principal, compte administrateur et identité locale.">
      <MockWindow title="Bienvenue sur ToqueHub" delay={8} frame={frame}>
        <StepList
          frame={frame}
          items={[
            "Compte administrateur",
            "Nom de l'etablissement",
            "Type et taille d'equipe",
            "Logo et personnalisation",
          ]}
        />
        <div style={{
          ...styles.primaryButton,
          background: `linear-gradient(135deg, ${palette.emerald}, ${palette.blue})`,
          boxShadow: "0 10px 25px rgba(16, 185, 129, 0.25)",
          textAlign: "center",
          justifyContent: "center",
        }}>Creer mon environnement</div>
      </MockWindow>
    </ProductScene>
  );
}

function CatalogScene({ frame }: { frame: number }) {
  const apps = [
    ["Stocks", palette.emerald, "Disponible"],
    ["Fiches techniques", palette.amber, "Disponible"],
    ["Cours des Produits", palette.blue, "Disponible"],
    ["Planning", "#a78bfa", "Disponible"],
    ["RH", palette.muted, "Disponible"],
    ["HACCP", palette.rose, "Bientot"],
  ];
  return (
    <ProductScene frame={frame} title="Un catalogue d'applications" text="On active les modules utiles, sans dupliquer les donnees metier.">
      <div style={{ ...styles.appGrid, ...slide(frame, 10, 120) }}>
        {apps.map(([name, color, status], index) => {
          const delay = 15 + index * 4;
          const appAppearance = appear(frame, delay);
          const isSoon = status === "Bientot";
          return (
            <div
              key={name}
              style={{
                ...styles.appCard,
                ...appAppearance,
                transform: `${appAppearance.transform} perspective(1000px) rotateX(4deg) rotateY(-2deg)`,
                borderColor: isSoon ? "rgba(255, 255, 255, 0.05)" : `rgba(${color === palette.emerald ? "16, 185, 129" : color === palette.blue ? "59, 130, 246" : color === palette.amber ? "245, 158, 11" : color === palette.rose ? "244, 63, 94" : "148, 163, 184"}, 0.22)`,
                boxShadow: isSoon ? "none" : `0 12px 30px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(${color === palette.emerald ? "16, 185, 129" : color === palette.blue ? "59, 130, 246" : color === palette.amber ? "245, 158, 11" : color === palette.rose ? "244, 63, 94" : "148, 163, 184"}, 0.06)`,
              }}
            >
              <div style={{ ...styles.appIcon, background: `linear-gradient(135deg, ${color}, rgba(255, 255, 255, 0.1))` }}>
                {name.slice(0, 1)}
              </div>
              <strong style={{ fontSize: 26, color: palette.ink }}>{name}</strong>
              <span style={{
                fontSize: 18,
                fontWeight: 800,
                color: isSoon ? palette.muted : palette.emerald,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}>{status}</span>
            </div>
          );
        })}
      </div>
    </ProductScene>
  );
}

function StocksScene({ frame }: { frame: number }) {
  return (
    <ProductScene frame={frame} title="Stocks tracables" text="Toute variation passe par un mouvement: reception, production, perte, inventaire ou transfert.">
      <MockWindow title="Stocks" delay={6} frame={frame} wide>
        <MetricRow
          frame={frame}
          metrics={[
            ["Produits", "148"],
            ["Fournisseurs", "32"],
            ["Valeur stock", "18 420 EUR"],
            ["Mouvements", "276"],
          ]}
        />
        <TableMock
          frame={frame}
          rows={[
            ["Tomate grappe", "+24 kg", "Reception", "Chambre froide"],
            ["Farine T65", "-8 kg", "Production", "Reserve seche"],
            ["Cabillaud", "-3 kg", "Perte", "Cuisine"],
          ]}
        />
      </MockWindow>
    </ProductScene>
  );
}

function TechnicalSheetsScene({ frame }: { frame: number }) {
  return (
    <ProductScene frame={frame} title="Fiches techniques connectees" text="Les recettes s'appuient sur les produits du stock et recalculent les couts matiere.">
      <MockWindow title="Fiche technique - Sauce tomate maison" delay={6} frame={frame} wide>
        <div style={styles.recipeLayout}>
          <div>
            <MetricRow frame={frame} metrics={[["Portions", "50"], ["Cout portion", "0,42 EUR"], ["Allergenes", "2"]]} compact />
            <IngredientBars frame={frame} />
          </div>
          <div style={styles.recipeSteps}>
            <strong style={{ fontSize: 24, color: palette.ink, marginBottom: 8 }}>Production theorique</strong>
            <span style={{ display: "flex", justifyContent: "space-between" }}>Tomate grappe <strong style={{ color: palette.rose }}>x 7,5 kg</strong></span>
            <span style={{ display: "flex", justifyContent: "space-between" }}>Oignon jaune <strong style={{ color: palette.amber }}>x 1,2 kg</strong></span>
            <span style={{ display: "flex", justifyContent: "space-between" }}>Huile olive <strong style={{ color: palette.emerald }}>x 0,4 L</strong></span>
            <div style={{
              ...styles.exportPill,
              background: `linear-gradient(135deg, ${palette.emerald}, ${palette.blue})`,
              boxShadow: "0 8px 20px rgba(16, 185, 129, 0.2)",
              cursor: "pointer",
            }}>Export PDF / CSV</div>
          </div>
        </div>
      </MockWindow>
    </ProductScene>
  );
}

function RnmScene({ frame }: { frame: number }) {
  return (
    <ProductScene frame={frame} title="Prix marche sous surveillance" text="Les cours RNM FranceAgriMer donnent un repere externe pour suivre les variations.">
      <MockWindow title="Cours des Produits - RNM" delay={5} frame={frame} wide>
        <div style={styles.rnmLayout}>
          <div style={styles.searchBox}>Recherche: tomate</div>
          <LineChart frame={frame} />
          <div style={styles.trendList}>
            <Trend name="Tomate grappe" value="+8,4%" color={palette.rose} />
            <Trend name="Cabillaud" value="-3,1%" color={palette.emerald} />
            <Trend name="Beurre" value="+2,7%" color={palette.amber} />
          </div>
        </div>
      </MockWindow>
    </ProductScene>
  );
}

function OperationsScene({ frame }: { frame: number }) {
  return (
    <ProductScene frame={frame} title="Une organisation coherente" text="RH, planning et permissions partagent le meme coeur: utilisateurs, roles, collaborateurs et sites.">
      <div style={styles.operationsGrid}>
        <MiniModule frame={frame} delay={5} title="Planning" color={palette.blue} lines={["Vue semaine", "Remplacements", "Alertes RH"]} />
        <MiniModule frame={frame} delay={14} title="RH" color={palette.amber} lines={["Collaborateurs", "Services", "Roulements"]} />
        <MiniModule frame={frame} delay={23} title="Permissions" color={palette.emerald} lines={["Roles", "Acces", "Utilisateurs"]} />
      </div>
    </ProductScene>
  );
}

function FinalScene({ frame }: { frame: number }) {
  return <FinalLockup frame={frame} />;
}

function FinalLockup({ frame, thumbnail = false }: { frame: number; thumbnail?: boolean }) {
  const intro = appear(frame, 0, 30);
  return (
    <SceneShell center>
      <div
        style={{
          ...styles.lockup,
          maxWidth: thumbnail ? 1240 : 1080,
          opacity: intro.opacity,
          transform: `${intro.transform} translateY(-82px)`,
        }}
      >
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute",
            inset: -60,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, rgba(59, 130, 246, 0.35) 30%, rgba(8, 11, 17, 0) 70%)",
            opacity: Math.sin(frame * 0.05) * 0.3 + 0.7,
            zIndex: -1,
          }} />
          <BrandMark />
        </div>
        <h1 style={{
          ...styles.finalTitle,
          background: "linear-gradient(135deg, #ffffff 30%, #94a3b8 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>Une seule plateforme.</h1>
        <p style={styles.finalSub}>Une seule source de verite pour votre cuisine.</p>
        <div style={{
          ...styles.finalPromise,
          background: "rgba(13, 18, 30, 0.75)",
          border: `1px solid ${palette.glassBorder}`,
          backdropFilter: "blur(20px)",
          color: palette.ink,
        }}>Toutes les donnees de votre cuisine, hebergees chez vous.</div>
        <div style={{
          ...styles.ctaInline,
          background: `linear-gradient(135deg, ${palette.emerald}, ${palette.blue})`,
          boxShadow: "0 10px 30px rgba(16, 185, 129, 0.3)",
          ...appear(frame, 48),
        }}>Decouvrir ToqueHub</div>
      </div>
      <div style={{ ...styles.futureLine, ...appear(frame, 72) }}>
        Planning, RH, HACCP, achats et bien plus arrivent progressivement.
      </div>
    </SceneShell>
  );
}

function ProductScene({
  frame,
  title,
  text,
  children,
}: {
  frame: number;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <SceneShell>
      <div style={{ ...styles.productCopy, ...appear(frame, 0) }}>
        <Kicker>ToqueHub en action</Kicker>
        <h1 style={{
          ...styles.h1,
          background: "linear-gradient(135deg, #ffffff 40%, #94a3b8 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>{title}</h1>
        <p style={styles.lead}>{text}</p>
      </div>
      <div style={styles.productVisual}>{children}</div>
    </SceneShell>
  );
}

function SceneShell({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <AbsoluteFill
      style={{
        padding: 120,
        display: "flex",
        alignItems: center ? "center" : "stretch",
        justifyContent: center ? "center" : "flex-start",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <div style={styles.kicker}>{children}</div>;
}

function BrandMark({ small = false }: { small?: boolean }) {
  const size = small ? 42 : 112;
  return (
    <div style={{
      ...styles.mark,
      width: size,
      height: size,
      borderRadius: small ? 12 : 28,
      background: `linear-gradient(135deg, ${palette.emerald}, ${palette.blue})`,
      boxShadow: small ? "0 4px 10px rgba(16, 185, 129, 0.3)" : "0 16px 40px rgba(16, 185, 129, 0.4)",
      border: "1px solid rgba(255, 255, 255, 0.2)",
    }}>
      <span style={{ fontSize: small ? 20 : 52, color: "#ffffff", fontWeight: 900 }}>T</span>
    </div>
  );
}

function SpreadsheetCard({ title, color, style }: { title: string; color: string; style: CSSProperties }) {
  return (
    <div style={{ ...styles.sheet, ...style }}>
      <div style={{ ...styles.sheetTop, background: `linear-gradient(135deg, ${color}, rgba(255,255,255,0.1))` }}>{title}</div>
      {Array.from({ length: 7 }).map((_, row) => (
        <div key={row} style={{
          ...styles.sheetRow,
          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        }}>
          {Array.from({ length: 4 }).map((__, col) => (
            <span
              key={col}
              style={{
                display: "block",
                width: `${34 + ((row + col) % 3) * 18}%`,
                height: 12,
                borderRadius: 999,
                background: "rgba(255, 255, 255, 0.08)",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function MockWindow({
  title,
  children,
  frame,
  delay,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  frame: number;
  delay: number;
  wide?: boolean;
}) {
  return (
    <div style={{ ...(wide ? styles.mockWindowWide : styles.mockWindow), ...slide(frame, delay, 130) }}>
      <div style={styles.windowTop}>
        <div style={styles.dots}>
          <span style={{ ...styles.dot, background: palette.rose }} />
          <span style={{ ...styles.dot, background: palette.amber }} />
          <span style={{ ...styles.dot, background: palette.emerald }} />
        </div>
        <strong style={{ color: palette.ink, fontSize: 24, fontWeight: 700 }}>{title}</strong>
      </div>
      <div style={styles.windowBody}>{children}</div>
    </div>
  );
}

function StepList({ frame, items }: { frame: number; items: string[] }) {
  return (
    <div style={styles.stepList}>
      {items.map((item, index) => (
        <div key={item} style={{ ...styles.stepItem, ...appear(frame, 22 + index * 7) }}>
          <span style={styles.check}>✓</span>
          <strong style={{ color: palette.ink }}>{item}</strong>
        </div>
      ))}
    </div>
  );
}

function MetricRow({ frame, metrics, compact = false }: { frame: number; metrics: string[][]; compact?: boolean }) {
  return (
    <div style={{ ...styles.metricRow, gridTemplateColumns: `repeat(${metrics.length}, 1fr)` }}>
      {metrics.map(([label, value], index) => (
        <div key={label} style={{ ...styles.metric, padding: compact ? 18 : 24, ...appear(frame, 18 + index * 4) }}>
          <span style={{ color: palette.muted, fontSize: 18, fontWeight: 600 }}>{label}</span>
          <strong style={{ color: palette.ink, fontSize: 32, fontWeight: 800 }}>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function TableMock({ frame, rows }: { frame: number; rows: string[][] }) {
  return (
    <div style={styles.table}>
      {rows.map((row, index) => (
        <div key={row.join("-")} style={{ ...styles.tableRow, ...appear(frame, 34 + index * 6) }}>
          {row.map((cell, cellIndex) => {
            const isChange = cell.startsWith("+") || cell.startsWith("-");
            const isPositive = cell.startsWith("+");
            return (
              <span
                key={cellIndex}
                style={{
                  color: isChange
                    ? (isPositive ? palette.emerald : palette.rose)
                    : (cellIndex === 0 ? palette.ink : palette.muted),
                  fontWeight: (cellIndex === 0 || isChange) ? 800 : 500,
                  fontSize: 22,
                }}
              >
                {cell}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function IngredientBars({ frame }: { frame: number }) {
  const ingredients = [
    ["Tomate", 86, palette.rose],
    ["Oignon", 48, palette.amber],
    ["Huile", 28, palette.emerald],
  ] as const;
  return (
    <div style={styles.ingredientBars}>
      {ingredients.map(([name, width, color], index) => {
        const animatedWidth = interpolate(frame, [30 + index * 6, 64 + index * 6], [0, width], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });
        return (
          <div key={name} style={styles.ingredientLine}>
            <span style={{ color: palette.muted, fontSize: 22, fontWeight: 700 }}>{name}</span>
            <div style={{
              background: "rgba(255, 255, 255, 0.08)",
              height: 20,
              borderRadius: 999,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}>
              <i style={{
                display: "block",
                height: "100%",
                borderRadius: 999,
                width: `${animatedWidth}%`,
                background: `linear-gradient(90deg, ${color}, rgba(255, 255, 255, 0.3))`,
                boxShadow: `0 0 12px ${color === palette.rose ? palette.roseGlow : color === palette.amber ? palette.amberGlow : palette.emeraldGlow}`,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({ frame }: { frame: number }) {
  const draw = interpolate(frame, [22, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <svg viewBox="0 0 600 260" style={styles.chart}>
      <line x1="40" y1="50" x2="560" y2="50" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="2" />
      <line x1="40" y1="100" x2="560" y2="100" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="2" />
      <line x1="40" y1="150" x2="560" y2="150" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="2" />
      <line x1="40" y1="210" x2="560" y2="210" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="2" />
      
      <path
        d="M40 210 L130 185 L220 194 L310 120 L400 142 L500 82 L560 102 L560 210 L40 210 Z"
        fill="url(#chart-area-grad)"
        opacity={draw * 0.22}
      />
      
      <path d="M40 210 L130 185 L220 194 L310 120 L400 142 L500 82 L560 102" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="12" strokeLinecap="round" />
      <path
        d="M40 210 L130 185 L220 194 L310 120 L400 142 L500 82 L560 102"
        fill="none"
        stroke={palette.blue}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray="720"
        strokeDashoffset={720 - 720 * draw}
      />
      
      <defs>
        <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.blue} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      
      <circle cx="500" cy="82" r="14" fill={palette.rose} opacity={draw} style={{ filter: "drop-shadow(0 0 10px #f43f5e)" }} />
      <circle cx="500" cy="82" r="6" fill="#ffffff" opacity={draw} />
    </svg>
  );
}

function Trend({ name, value, color }: { name: string; value: string; color: string }) {
  const isPositive = value.startsWith("+");
  return (
    <div style={styles.trend}>
      <span style={{ color: palette.ink }}>{name}</span>
      <strong style={{ color: isPositive ? palette.emerald : palette.rose }}>{value}</strong>
    </div>
  );
}

function MiniModule({ frame, delay, title, color, lines }: { frame: number; delay: number; title: string; color: string; lines: string[] }) {
  const appearance = appear(frame, delay);
  return (
    <div style={{
      ...styles.miniModule,
      ...appearance,
      transform: `${appearance.transform} perspective(1000px) rotateX(4deg) rotateY(-2deg)`,
    }}>
      <div style={{ ...styles.appIcon, background: `linear-gradient(135deg, ${color}, rgba(255, 255, 255, 0.1))` }}>{title.slice(0, 1)}</div>
      <h3 style={{ fontSize: 32, margin: "10px 0 0", color: palette.ink }}>{title}</h3>
      {lines.map((line) => (
        <span key={line} style={{ color: palette.muted, fontSize: 22, fontWeight: 600 }}>• {line}</span>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  stage: {
    fontFamily: "'Plus Jakarta Sans', Inter, sans-serif",
    color: palette.ink,
    overflow: "hidden",
  },
  topBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    background: `linear-gradient(90deg, ${palette.emerald}, ${palette.blue}, ${palette.amber}, ${palette.rose})`,
  },
  bottomBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 18,
    background: "rgba(255, 255, 255, 0.03)",
  },
  brandTop: {
    position: "absolute",
    top: 44,
    left: 64,
    right: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 24,
    fontWeight: 800,
    color: "rgba(255, 255, 255, 0.7)",
  },
  timeline: {
    position: "absolute",
    left: 64,
    right: 64,
    bottom: 34,
    height: 8,
    display: "flex",
    gap: 5,
  },
  captionWrap: {
    position: "absolute",
    left: 120,
    right: 120,
    bottom: 72,
    padding: "28px 34px",
    borderRadius: 24,
    background: "rgba(15, 23, 42, 0.94)",
    border: `1px solid ${palette.glassBorder}`,
    boxShadow: "0 24px 70px rgba(0, 0, 0, 0.4)",
  },
  captionMeta: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
    color: palette.emerald,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontSize: 20,
    fontWeight: 900,
  },
  captionText: {
    fontSize: 33,
    lineHeight: 1.22,
    fontWeight: 800,
    color: palette.ink,
  },
  largeCopy: {
    width: 650,
    position: "absolute",
    left: 120,
    top: 250,
    zIndex: 5,
  },
  productCopy: {
    width: 560,
    position: "absolute",
    left: 120,
    top: 250,
    zIndex: 5,
  },
  productVisual: {
    position: "absolute",
    left: 760,
    top: 160,
    right: 110,
    bottom: 190,
  },
  kicker: {
    display: "inline-flex",
    padding: "10px 18px",
    borderRadius: 999,
    color: palette.emerald,
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.25)",
    textTransform: "uppercase",
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: 1.5,
    marginBottom: 24,
  },
  h1: {
    margin: 0,
    fontSize: 76,
    lineHeight: 1.0,
    letterSpacing: -1,
    fontWeight: 900,
  },
  lead: {
    marginTop: 28,
    fontSize: 31,
    lineHeight: 1.3,
    color: palette.muted,
    fontWeight: 500,
  },
  storyPanel: {
    width: 690,
    position: "absolute",
    left: 120,
    top: 250,
  },
  chefBoard: {
    position: "absolute",
    right: 140,
    top: 185,
    width: 760,
    padding: 32,
    borderRadius: 32,
    background: palette.glass,
    border: `1px solid ${palette.glassBorder}`,
    boxShadow: "0 34px 90px rgba(0, 0, 0, 0.35)",
  },
  boardHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 26,
    color: palette.muted,
  },
  ticketGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  },
  ticket: {
    borderLeft: "8px solid",
    background: "rgba(255, 255, 255, 0.03)",
    border: `1px solid ${palette.glassBorder}`,
    borderLeftWidth: 8,
    padding: 22,
    borderRadius: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontSize: 24,
    fontWeight: 800,
    color: palette.ink,
  },
  lockup: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  heroTitle: {
    margin: "34px 0 0",
    fontSize: 142,
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: -2,
  },
  heroSub: {
    width: 920,
    margin: "30px 0 0",
    fontSize: 44,
    lineHeight: 1.25,
    fontWeight: 600,
    color: palette.muted,
  },
  promiseStrip: {
    position: "absolute",
    bottom: 230,
    display: "flex",
    gap: 16,
  },
  mark: {
    display: "grid",
    placeItems: "center",
    color: "white",
    fontWeight: 950,
  },
  sheet: {
    position: "absolute",
    width: 420,
    height: 280,
    background: palette.glass,
    border: `1px solid ${palette.glassBorder}`,
    borderRadius: 22,
    boxShadow: "0 30px 70px rgba(0, 0, 0, 0.4)",
    overflow: "hidden",
  },
  sheetTop: {
    height: 58,
    color: "white",
    padding: "16px 20px",
    fontWeight: 850,
    fontSize: 22,
    borderBottom: `1px solid ${palette.glassBorder}`,
  },
  sheetRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
    padding: "12px 18px",
  },
  mockWindow: {
    width: 720,
    minHeight: 560,
    background: palette.glass,
    borderRadius: 34,
    border: `1px solid ${palette.glassBorder}`,
    overflow: "hidden",
    boxShadow: "0 34px 90px rgba(0, 0, 0, 0.4)",
  },
  mockWindowWide: {
    width: "100%",
    height: "100%",
    background: palette.glass,
    borderRadius: 34,
    border: `1px solid ${palette.glassBorder}`,
    overflow: "hidden",
    boxShadow: "0 34px 90px rgba(0, 0, 0, 0.4)",
  },
  windowTop: {
    height: 74,
    background: "rgba(255, 255, 255, 0.02)",
    display: "flex",
    alignItems: "center",
    gap: 22,
    padding: "0 28px",
    borderBottom: `1px solid ${palette.glassBorder}`,
    fontSize: 24,
  },
  dots: {
    display: "flex",
    gap: 8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    display: "block",
  },
  windowBody: {
    padding: 32,
  },
  stepList: {
    display: "grid",
    gap: 18,
    marginBottom: 28,
  },
  stepItem: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    padding: 22,
    borderRadius: 20,
    background: "rgba(255, 255, 255, 0.02)",
    border: `1px solid ${palette.glassBorder}`,
    fontSize: 25,
  },
  check: {
    width: 38,
    height: 38,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: `linear-gradient(135deg, ${palette.emerald}, ${palette.blue})`,
    color: "white",
    fontWeight: 900,
    boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
  },
  primaryButton: {
    display: "inline-flex",
    padding: "20px 28px",
    borderRadius: 18,
    color: "white",
    fontWeight: 900,
    fontSize: 24,
  },
  appGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 20,
  },
  appCard: {
    minHeight: 210,
    background: palette.glass,
    border: `1px solid ${palette.glassBorder}`,
    borderRadius: 28,
    padding: 26,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  appIcon: {
    width: 62,
    height: 62,
    borderRadius: 18,
    display: "grid",
    placeItems: "center",
    color: "white",
    fontWeight: 950,
    fontSize: 28,
    border: "1px solid rgba(255, 255, 255, 0.15)",
  },
  metricRow: {
    display: "grid",
    gap: 16,
    marginBottom: 26,
  },
  metric: {
    border: `1px solid ${palette.glassBorder}`,
    borderRadius: 20,
    background: "rgba(255, 255, 255, 0.02)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  table: {
    display: "grid",
    gap: 14,
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1.3fr 0.7fr 0.8fr 1fr",
    gap: 12,
    padding: "18px 20px",
    borderRadius: 18,
    background: "rgba(255, 255, 255, 0.01)",
    border: `1px solid ${palette.glassBorder}`,
  },
  recipeLayout: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 28,
  },
  recipeSteps: {
    borderRadius: 24,
    background: "rgba(255, 255, 255, 0.02)",
    border: `1px solid ${palette.glassBorder}`,
    padding: 26,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    fontSize: 23,
    color: palette.muted,
  },
  exportPill: {
    marginTop: 10,
    padding: "14px 18px",
    borderRadius: 999,
    color: "white",
    fontWeight: 850,
    textAlign: "center",
  },
  ingredientBars: {
    display: "grid",
    gap: 22,
  },
  ingredientLine: {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    alignItems: "center",
    gap: 18,
    fontSize: 24,
    fontWeight: 800,
  },
  rnmLayout: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.8fr",
    gap: 26,
  },
  searchBox: {
    gridColumn: "1 / -1",
    padding: "20px 24px",
    borderRadius: 20,
    background: "rgba(255, 255, 255, 0.02)",
    border: `1px solid ${palette.glassBorder}`,
    fontSize: 24,
    fontWeight: 800,
    color: palette.muted,
  },
  chart: {
    width: "100%",
    height: 310,
    background: "rgba(0, 0, 0, 0.2)",
    borderRadius: 24,
    border: `1px solid ${palette.glassBorder}`,
  },
  trendList: {
    display: "grid",
    gap: 16,
  },
  trend: {
    padding: 22,
    borderRadius: 20,
    background: "rgba(255, 255, 255, 0.02)",
    border: `1px solid ${palette.glassBorder}`,
    display: "flex",
    justifyContent: "space-between",
    fontSize: 23,
    fontWeight: 850,
  },
  operationsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 24,
    height: "100%",
    alignItems: "center",
  },
  miniModule: {
    minHeight: 430,
    padding: 34,
    borderRadius: 30,
    background: palette.glass,
    border: `1px solid ${palette.glassBorder}`,
    boxShadow: "0 28px 80px rgba(0, 0, 0, 0.3)",
    display: "flex",
    flexDirection: "column",
    gap: 22,
    fontSize: 25,
    fontWeight: 760,
  },
  finalTitle: {
    margin: "34px 0 0",
    fontSize: 118,
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: -2,
  },
  finalSub: {
    margin: "22px 0 0",
    fontSize: 52,
    lineHeight: 1.15,
    fontWeight: 800,
    color: palette.muted,
  },
  finalPromise: {
    marginTop: 42,
    padding: "24px 34px",
    borderRadius: 24,
    boxShadow: "0 24px 70px rgba(0, 0, 0, 0.4)",
    fontSize: 31,
    fontWeight: 800,
  },
  ctaInline: {
    marginTop: 28,
    padding: "22px 42px",
    borderRadius: 999,
    color: "white",
    fontSize: 28,
    fontWeight: 900,
  },
  futureLine: {
    position: "absolute",
    bottom: 176,
    fontSize: 24,
    fontWeight: 740,
    color: palette.muted,
  },
};
