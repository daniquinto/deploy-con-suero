# Causas — Mano Abierta

Este archivo contiene las causas/campañas disponibles en la aplicación. La información está en un bloque JSON válido para poder copiarla directamente a Node.js, guardarla como datos semilla o transformarla en respuestas de una API.

## Datos

```json
[
  {
    "id": "agua-limpia-la-guajira",
    "title": "Agua limpia para La Guajira",
    "organization": "Fundación Agua y Vida",
    "category": "Comunidades",
    "location": "Uribia, La Guajira",
    "description": "Construiremos sistemas de almacenamiento y filtración de agua para 120 familias de comunidades rurales.",
    "imageUrl": "https://images.unsplash.com/photo-1504159506876-f8338247a14a?auto=format&fit=crop&w=900&q=80",
    "raised": 38450000,
    "goal": 50000000,
    "donors": 428,
    "beneficiaries": 120,
    "deadline": "31/12/2026",
    "fundsUse": ["Sistemas de almacenamiento y filtración", "Transporte e instalación", "Acompañamiento a las familias"]
  },
  {
    "id": "biblioteca-para-sonar",
    "title": "Una biblioteca para soñar",
    "organization": "Fundación Niñez con Futuro",
    "category": "Educación",
    "location": "Buenaventura, Valle",
    "description": "Crearemos un espacio seguro con libros, tecnología y acompañamiento escolar para más de 300 niños y jóvenes.",
    "imageUrl": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80",
    "raised": 18200000,
    "goal": 30000000,
    "donors": 216,
    "beneficiaries": 300,
    "deadline": "31/12/2026",
    "fundsUse": ["Materiales y kits educativos", "Acompañamiento pedagógico", "Transporte y logística local"]
  },
  {
    "id": "bosques-vuelven-respirar",
    "title": "Bosques que vuelven a respirar",
    "organization": "Red Solidaria Colombia",
    "category": "Ambiente",
    "location": "Sierra Nevada de Santa Marta",
    "description": "Restauraremos 20 hectáreas con especies nativas y trabajo remunerado para familias de la región.",
    "imageUrl": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80",
    "raised": 24750000,
    "goal": 45000000,
    "donors": 301,
    "beneficiaries": 80,
    "deadline": "31/12/2026",
    "fundsUse": ["Restauración y herramientas", "Jornales para familias locales", "Seguimiento del ecosistema"]
  },
  {
    "id": "atencion-medica-sin-fronteras",
    "title": "Atención médica sin fronteras",
    "organization": "Fundación Agua y Vida",
    "category": "Salud",
    "location": "Pacífico colombiano",
    "description": "Llevaremos brigadas médicas, medicamentos y atención preventiva a comunidades de difícil acceso.",
    "imageUrl": "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80",
    "raised": 12600000,
    "goal": 40000000,
    "donors": 173,
    "beneficiaries": 450,
    "deadline": "31/12/2026",
    "fundsUse": ["Medicamentos y atención primaria", "Equipos para brigadas médicas", "Traslados de pacientes"]
  },
  {
    "id": "refugio-familias-inundacion",
    "title": "Refugio para familias después de la inundación",
    "organization": "Red Solidaria Colombia",
    "category": "Comunidades",
    "location": "Santa Cruz de Mompox, Bolívar",
    "description": "Entregaremos kits de emergencia, alimentos y soluciones temporales de vivienda a familias afectadas.",
    "imageUrl": "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80",
    "raised": 21900000,
    "goal": 35000000,
    "donors": 287,
    "beneficiaries": 210,
    "deadline": "31/12/2026",
    "fundsUse": ["Ayudas y suministros esenciales", "Transporte y distribución", "Acompañamiento a las familias"]
  },
  {
    "id": "alimentacion-para-crecer",
    "title": "Alimentación para crecer",
    "organization": "Fundación Niñez con Futuro",
    "category": "Comunidades",
    "location": "Soacha, Cundinamarca",
    "description": "Aseguraremos complementos alimentarios para 180 niños durante el año escolar.",
    "imageUrl": "https://images.unsplash.com/photo-1602030028438-4cf153cbae9e?auto=format&fit=crop&w=900&q=80",
    "raised": 15800000,
    "goal": 28000000,
    "donors": 192,
    "beneficiaries": 180,
    "deadline": "31/12/2026",
    "fundsUse": ["Complementos alimentarios", "Seguimiento nutricional", "Distribución en instituciones educativas"]
  },
  {
    "id": "reconstruccion-de-hogares",
    "title": "Reconstrucción de hogares",
    "organization": "Red Solidaria Colombia",
    "category": "Comunidades",
    "location": "Quibdó, Chocó",
    "description": "Repararemos viviendas afectadas por deslizamientos y devolveremos seguridad a 35 familias.",
    "imageUrl": "https://images.unsplash.com/photo-1542810634-71277d95dcbb?auto=format&fit=crop&w=900&q=80",
    "raised": 30200000,
    "goal": 60000000,
    "donors": 344,
    "beneficiaries": 35,
    "deadline": "31/12/2026",
    "fundsUse": ["Materiales de construcción", "Mano de obra local", "Supervisión técnica"]
  },
  {
    "id": "primera-infancia-segura",
    "title": "Primera infancia segura",
    "organization": "Fundación Niñez con Futuro",
    "category": "Salud",
    "location": "Tumaco, Nariño",
    "description": "Fortaleceremos la atención integral y la protección de 90 niños en sus primeros años de vida.",
    "imageUrl": "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=900&q=80",
    "raised": 19400000,
    "goal": 32000000,
    "donors": 229,
    "beneficiaries": 90,
    "deadline": "31/12/2026",
    "fundsUse": ["Atención integral", "Controles de crecimiento", "Protección y acompañamiento familiar"]
  },
  {
    "id": "kits-escolares-regreso-clases",
    "title": "Kits escolares para volver a clases",
    "organization": "Fundación Agua y Vida",
    "category": "Educación",
    "location": "Cúcuta, Norte de Santander",
    "description": "Entregaremos útiles y uniformes a 250 estudiantes para que puedan continuar su formación.",
    "imageUrl": "https://images.unsplash.com/photo-1509099836639-18ba02c0c1a0?auto=format&fit=crop&w=900&q=80",
    "raised": 9800000,
    "goal": 18000000,
    "donors": 156,
    "beneficiaries": 250,
    "deadline": "31/12/2026",
    "fundsUse": ["Útiles escolares", "Uniformes", "Entrega y seguimiento escolar"]
  },
  {
    "id": "manglares-proteger-costa",
    "title": "Manglares para proteger la costa",
    "organization": "Red Solidaria Colombia",
    "category": "Ambiente",
    "location": "Nuquí, Chocó",
    "description": "Restauraremos manglares junto a las comunidades para proteger la costa y recuperar la biodiversidad.",
    "imageUrl": "https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=900&q=80",
    "raised": 11600000,
    "goal": 25000000,
    "donors": 138,
    "beneficiaries": 120,
    "deadline": "31/12/2026",
    "fundsUse": ["Restauración de manglares", "Herramientas para la comunidad", "Monitoreo de biodiversidad"]
  }
]
```

## Uso rápido en Node.js

```js
import fs from 'node:fs';

const markdown = fs.readFileSync('./juajo.md', 'utf8');
const jsonBlock = markdown.match(/```json\s*([\s\S]*?)\s*```/);
const causes = JSON.parse(jsonBlock[1]);

console.log(causes.length); // 10
console.log(causes[0].title);
```
