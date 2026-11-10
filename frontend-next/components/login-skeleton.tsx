import { LockKeyhole } from "lucide-react";
import { LoginFormHeading } from "@/components/login-form-heading";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function LoginSkeleton() {
  return (
    <Card className="auth-form" role="status" aria-label="Loading sign-in">
      <span className="sr-only">Checking your session...</span>
      <CardContent className="auth-form-content" aria-hidden="true">
        <LoginFormHeading />
        <div className="auth-fields">
          <div className="auth-field">
            <Skeleton className="h-[17px] w-28" />
            <Skeleton className="h-[46px] w-full rounded-[10px]" />
          </div>
          <div className="auth-field">
            <Skeleton className="h-[17px] w-20" />
            <Skeleton className="h-[46px] w-full rounded-[10px]" />
          </div>
          <Skeleton className="mt-1 h-[46px] w-full rounded-[10px]" />
        </div>
        <p className="auth-session-note"><LockKeyhole size={12} aria-hidden="true" />Your workspace stays signed in on this tab.</p>
        <div className="auth-form-bottom">
          <div className="auth-mode-line min-h-11">
            <Skeleton className="h-4 w-52 max-w-full" />
          </div>
          <p className="auth-access-note">Shelter team member? Ask your administrator to arrange staff access.</p>
        </div>
      </CardContent>
    </Card>
  );
}
