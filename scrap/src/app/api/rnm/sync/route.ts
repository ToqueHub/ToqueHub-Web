import { NextRequest, NextResponse } from 'next/server';
import { RnmSyncService } from '../../../../modules/rnm/services/rnm-sync.service';

// Allow this route to run in dynamic mode (since it uses headers/query params)
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || request.headers.get('x-sync-token');
    const expectedToken = process.env.SYNC_TOKEN;

    // If a token is configured in environment variables, validate it
    if (expectedToken && token !== expectedToken) {
      return NextResponse.json(
        { success: false, message: 'Non autorisé. Jeton de synchronisation invalide.' },
        { status: 401 }
      );
    }

    const syncService = new RnmSyncService();
    
    console.log('[HTTP-SYNC] Requête de synchronisation déclenchée par HTTP. Lancement en arrière-plan...');
    
    // We run the sync in the background (no await) to respond immediately and avoid HTTP timeouts
    syncService.syncAllActiveProducts()
      .then((stats) => {
        const successCount = stats.filter(s => !s.error).length;
        const errorCount = stats.filter(s => s.error).length;
        console.log(`[HTTP-SYNC] Synchronisation en arrière-plan terminée. Réussis: ${successCount}, Échecs: ${errorCount}`);
      })
      .catch((err) => {
        console.error('[HTTP-SYNC] Erreur critique lors de la synchronisation en arrière-plan :', err);
      });

    return NextResponse.json({
      success: true,
      message: 'Synchronisation globale démarrée en arrière-plan avec succès.'
    }, { status: 202 });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
