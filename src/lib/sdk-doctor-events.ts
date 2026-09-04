export const SDK_DOCTOR_OPEN_EVENT = "one:sdk-doctor-open" as const;

export type SdkDoctorOpenEventDetail = { source: "pocket" | "workbench" };

export function isLiveSolutionStudioPath(pathname: string) {
  return pathname === "/live-solution-studio";
}
