import {
  CodeCommitSourceAction,
  CodeBuildAction,
} from "@aws-cdk/aws-codepipeline-actions";
import { PolicyStatement } from "@aws-cdk/aws-iam";
import { Construct, Stack, StackProps } from "@aws-cdk/core";
import { PipelineProject, LinuxBuildImage } from "@aws-cdk/aws-codebuild";
import { Artifact, Pipeline } from "@aws-cdk/aws-codepipeline";
import { Repository } from "@aws-cdk/aws-codecommit";
import { lambdaApiStackName, lambdaFunctionName } from "../bin/lambda";
import { C8 } from "c8-concept";

interface CIStackProps extends StackProps {
  repositoryName: string;
}

export const CIStack = C8(
  Stack,
  (def, props: CIStackProps) => {
    const pipeline = def`Pipeline`(Pipeline);

    const repo = Repository.fromRepositoryName(
      def.scope,
      "WidgetsServiceRepository",
      props.repositoryName
    );

    const sourceOutput = new Artifact("SourceOutput");
    const sourceAction = new CodeCommitSourceAction({
      actionName: "CodeCommit",
      repository: repo,
      output: sourceOutput,
    });

    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction],
    });

    const createBuildStage = (pipeline: Pipeline, sourceOutput: Artifact) => {
      const project = def`BuildProject`(PipelineProject, {
        environment: {
          buildImage: LinuxBuildImage.STANDARD_3_0,
        },
      });

      const cdkDeployPolicy = new PolicyStatement();
      cdkDeployPolicy.addActions(
        "cloudformation:GetTemplate",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DescribeStacks",
        "s3:*Object",
        "s3:ListBucket",
        "s3:getBucketLocation",
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:AddPermission",
        "lambda:RemovePermission"
      );
      cdkDeployPolicy.addResources(
        def.scope.formatArn({
          service: "cloudformation",
          resource: "stack",
          resourceName: "CDKToolkit/*",
        }),
        def.scope.formatArn({
          service: "cloudformation",
          resource: "stack",
          resourceName: `${lambdaApiStackName}/*`,
        }),
        def.scope.formatArn({
          service: "lambda",
          resource: "function",
          sep: ":",
          resourceName: lambdaFunctionName,
        }),
        "arn:aws:s3:::cdktoolkit-stagingbucket-*"
      );
      const editOrCreateLambdaDependencies = new PolicyStatement();
      editOrCreateLambdaDependencies.addActions(
        "iam:GetRole",
        "iam:PassRole",
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "apigateway:GET",
        "apigateway:DELETE",
        "apigateway:PUT",
        "apigateway:POST",
        "apigateway:PATCH",
        "s3:CreateBucket",
        "s3:PutBucketTagging"
      );
      editOrCreateLambdaDependencies.addResources("*");
      project.addToRolePolicy(cdkDeployPolicy);
      project.addToRolePolicy(editOrCreateLambdaDependencies);

      const buildOutput = new Artifact(`BuildOutput`);
      const buildAction = new CodeBuildAction({
        actionName: `Build`,
        project,
        input: sourceOutput,
        outputs: [buildOutput],
      });

      pipeline.addStage({
        stageName: "build",
        actions: [buildAction],
      });

      return buildOutput;
    };

    createBuildStage(pipeline, sourceOutput);

    return { createBuildStage } as const;
  },
  (props) => props
);
