const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get any task that is IN_PROGRESS or ACCEPTED
  const task = await prisma.checklistExecution.findFirst({
    where: { status: { in: ['IN_PROGRESS', 'ACCEPTED'] } },
    select: { id: true, status: true, locationLat: true, locationLng: true, locationZoneType: true, locationPolygon: true, ownerEmail: true }
  });
  
  console.log('Task found:', JSON.stringify(task, null, 2));

  if (!task) {
    console.log('No ACCEPTED/IN_PROGRESS task found.');
    return;
  }

  let destLat = task.locationLat;
  let destLng = task.locationLng;

  if (!destLat && task.locationPolygon) {
    let poly = task.locationPolygon;
    if (typeof poly === 'string') poly = JSON.parse(poly);
    if (poly && poly.length > 0) {
      destLat = poly[0][0] || poly[0].lat;
      destLng = poly[0][1] || poly[0].lng;
    }
    console.log('Using polygon coords:', destLat, destLng);
  }

  if (!destLat || !destLng) {
    console.log('No destination coordinates found on task.');
    return;
  }

  const currentLat = destLat + 0.05;
  const currentLng = destLng + 0.05;

  console.log(`\nTesting OSRM: current=(${currentLat},${currentLng}) -> dest=(${destLat},${destLng})`);
  
  const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${currentLng},${currentLat};${destLng},${destLat}?overview=false`;
  console.log('OSRM URL:', osrmUrl);
  
  const r = await fetch(osrmUrl, { signal: AbortSignal.timeout(8000) });
  const data = await r.json();
  
  if (data.routes && data.routes[0]) {
    const etaMinutes = Math.round(data.routes[0].duration / 60);
    console.log(`OSRM OK! ETA = ${etaMinutes} min`);
    
    const updated = await prisma.checklistExecution.update({
      where: { id: task.id },
      data: { etaMinutes }
    });
    console.log(`Task ${task.id} updated! etaMinutes=${updated.etaMinutes}`);
  } else {
    console.log('OSRM returned no routes:', JSON.stringify(data));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
