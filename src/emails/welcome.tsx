/** @jsxImportSource react */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "react-email";

interface WelcomeEmailProps {
  resetUrl: string;
  userName?: string;
}

export default function WelcomeEmail({ resetUrl, userName }: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Welcome — set your password</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>Welcome</Heading>

          <Text style={textStyle}>
            {userName ? `Hi ${userName},` : "Hello,"}
          </Text>

          <Text style={textStyle}>
            Your account has been created. Click the button below to set your
            password and get started.
          </Text>

          <Button href={resetUrl} style={buttonStyle}>
            Set Password
          </Button>

          <Text style={textStyle}>
            This link will expire in 15 minutes. If you did not expect this
            email, you can safely ignore it.
          </Text>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>
            If the button does not work, copy and paste this URL into your
            browser:
          </Text>

          <Link href={resetUrl} style={linkStyle}>
            {resetUrl}
          </Link>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const containerStyle: React.CSSProperties = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "560px",
};

const headingStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "12px",
};

const textStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "1.6",
  color: "#4a4a4a",
  marginBottom: "12px",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#0070f3",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "500",
  textDecoration: "none",
  textAlign: "center",
  display: "inline-block",
  padding: "12px 24px",
  borderRadius: "6px",
  margin: "16px 0",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e6e8eb",
  margin: "24px 0",
};

const footerStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "1.5",
  color: "#8a8f98",
};

const linkStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#0070f3",
  textDecoration: "underline",
  wordBreak: "break-all",
};
