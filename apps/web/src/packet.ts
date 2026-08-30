import type { MoveState, RouteDistance } from '@moving-day/contracts';
import { pdf } from '@react-pdf/renderer';
import { MoveReportDocument } from './packet-document';

export type MoveReportSelection = {
  truckProvider: string;
  truckVehicle: string;
  laborSource: string;
  rentalMode: 'one-way' | 'round-trip';
  drivenMiles: number;
  fuelGallons: number;
  truckCostLow: number;
  truckCostHigh: number;
  totalCostLow: number;
  totalCostHigh: number;
};

export async function downloadMoveReport(state: MoveState, selection: MoveReportSelection | null, route: RouteDistance | null, manuallyCompletedProviderIds: string[] = []) {
  const verifiedMode = Boolean(state.receipt);
  const document = MoveReportDocument({ state, selection, route, manuallyCompletedProviderIds });
  const blob = await pdf(document).toBlob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${state.moveCase.id}-${verifiedMode ? 'move-report' : 'move-action-plan'}.pdf`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
