import * as React from 'react'
import {withRouter} from 'react-router'
import * as Relay from 'react-relay'
import * as PureRenderMixin from 'react-addons-pure-render-mixin'
import * as cookiestore from 'cookiestore'
import {bindActionCreators} from 'redux'
import {classnames} from '../../utils/classnames'
import mapProps from '../../components/MapProps/MapProps'
import PopupWrapper from '../../components/PopupWrapper/PopupWrapper'
import OnboardingPopup from '../../components/onboarding/OnboardingPopup/OnboardingPopup'
import PlaygroundCPopup from '../../components/onboarding/PlaygroundCPopup/PlaygroundCPopup'
import {connect} from 'react-redux'
import {validateProjectName} from '../../utils/nameValidator'
import ProjectSelection from '../../components/ProjectSelection/ProjectSelection'
import SideNav from '../../views/ProjectRootView/SideNav'
import OnboardSideNav from './OnboardSideNav'
import LoginView from '../../views/LoginView/LoginView'
import AddProjectMutation from '../../mutations/AddProjectMutation'
import {update} from '../../actions/gettingStarted'
import {Viewer, Customer, Project} from '../../types/types'
import {PopupState} from '../../types/popup'
import {GettingStartedState} from '../../types/gettingStarted'
import tracker from '../../utils/metrics'
const classes: any = require('./ProjectRootView.scss')
import {ConsoleEvents} from 'graphcool-metrics'
import drumstick from 'drumstick'
require('../../styles/core.scss')

interface Props {
  router: ReactRouter.InjectedRouter
  children: Element
  isLoggedin: boolean
  viewer: Viewer
  user: Customer & {gettingStartedState: string}
  project: Project
  allProjects: Project[]
  params: any
  relay: any
  gettingStartedState: GettingStartedState
  popup: PopupState
  pollGettingStartedOnboarding: boolean
  update: (step: string, skipped: boolean, customerId: string) => void
}

class ProjectRootView extends React.Component<Props, {}> {

  shouldComponentUpdate: any

  private refreshInterval: any

  constructor(props: Props) {
    super(props)

    this.shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate.bind(this)

    this.updateForceFetching()

    cookiestore.set('graphcool_last_used_project_id', props.project.id)

    if (__HEARTBEAT_ADDR__) {
      drumstick.start({
        endpoint: __HEARTBEAT_ADDR__,
        payload: () => ({
          resource: 'console',
          token: cookiestore.get('graphcool_auth_token'),
          projectId: cookiestore.get('graphcool_last_used_project_id'),
        }),
        frequency: 60 * 1000,
      })
    }
  }

  componentWillMount() {
    if (this.props.isLoggedin) {
      tracker.identify(this.props.user.id, this.props.project.id)

      if (Smooch) {
        Smooch.init({
          appToken: __SMOOCH_TOKEN__,
          givenName: this.props.user.crm.information.name,
          email: this.props.user.crm.information.email,
          customText: {
            headerText: 'Can I help you? 🙌',
          },
        })
      }
    } else {
      // TODO migrate to tracker
      // analytics.identify({
      //   'Product': 'Dashboard',
      // })
    }
  }

  componentWillUnmount() {
    clearInterval(this.refreshInterval)
  }

  componentDidUpdate(prevProps: Props) {
    const {gettingStarted, gettingStartedSkipped} = this.props.user.crm.onboardingStatus
    const prevGettingStarted = prevProps.user.crm.onboardingStatus.gettingStarted

    if (this.props.params.projectName !== prevProps.params.projectName && this.props.isLoggedin) {
      tracker.identify(this.props.user.id, this.props.project.id)
    }

    if (gettingStarted !== prevGettingStarted) {
      this.updateForceFetching()

      tracker.track(ConsoleEvents.Onboarding.gettingStarted({step: gettingStarted, skipped: gettingStartedSkipped}))
      // TODO migrate to tracker
      // analytics.identify(this.props.user.id, {
      //   'Getting Started Status': gettingStarted,
      // })
    } else if (this.props.pollGettingStartedOnboarding !== prevProps.pollGettingStartedOnboarding) {
      this.updateForceFetching()
    }
  }

  render() {
    if (!this.props.isLoggedin) {
      return (
        <LoginView/>
      )
    }

    const blurBackground = this.props.popup.popups.reduce((acc, p) => p.blurBackground || acc, false)
    return (
      <div className={classes.root}>
        <div className={`${blurBackground ? classes.blur : ''} flex w-100`}>
          <div className={classes.sidebar}>
            <div className={classes.projectSelection}>
              <ProjectSelection
                params={this.props.params}
                projects={this.props.allProjects}
                selectedProject={this.props.project}
                add={this.addProject}
              />
            </div>
            <div className={classes.sidenav}>
              <SideNav
                params={this.props.params}
                project={this.props.project}
                viewer={this.props.viewer}
                projectCount={this.props.allProjects.length}
              />
            </div>
          </div>
          <div className={classnames(classes.content, 'flex')}>
            <div
              className='overflow-hidden'
              style={{
                flex: `0 0 calc(100%${this.props.gettingStartedState.isActive() ? ' - 266px' : ''})`,
              }}>
              {this.props.children}
            </div>
            {this.props.gettingStartedState.isActive() &&
            <div className='flex bg-accent' style={{ flex: '0 0 266px', zIndex: 1000, height: '100vh' }}>
              <OnboardSideNav params={this.props.params}/>
            </div>
            }
          </div>
        </div>
        {this.props.popup.popups.map(popup =>
          <PopupWrapper key={popup.id} id={popup.id}>
            {popup.element}
          </PopupWrapper>,
        )}
        {this.props.gettingStartedState.isCurrentStep('STEP0_OVERVIEW') &&
          <PopupWrapper>
            <OnboardingPopup firstName={this.props.user.crm.information.name}/>
          </PopupWrapper>
        }
        {(this.props.gettingStartedState.isCurrentStep('STEP4_CLICK_TEASER_STEP5') ||
        this.props.gettingStartedState.isCurrentStep('STEP5_SELECT_EXAMPLE') ||
        this.props.gettingStartedState.isCurrentStep('STEP5_WAITING') ||
        this.props.gettingStartedState.isCurrentStep('STEP5_DONE')) &&
          <PopupWrapper>
            <PlaygroundCPopup projectId={this.props.project.id} />
          </PopupWrapper>
        }
      </div>
    )
  }

  private updateForceFetching() {
    if (this.props.pollGettingStartedOnboarding) {
      if (!this.refreshInterval) {
        this.refreshInterval = setInterval(
          () => {
            // ideally we would handle this with a Redux thunk, but somehow Relay does not support raw force fetches...
            this.props.relay.forceFetch({}, () => {
              this.props.update(
                this.props.user.crm.onboardingStatus.gettingStarted,
                this.props.user.crm.onboardingStatus.gettingStartedSkipped,
                this.props.user.id,
              )
            })
          },
          1500,
        )
      }
    } else {
      clearInterval(this.refreshInterval)
    }
  }

  private addProject = () => {
    let projectName = window.prompt('Project name:')
    while (projectName != null && !validateProjectName(projectName)) {
      projectName = window.prompt('The inserted project name was invalid.' +
        ' Enter a valid project name, like "Project 2" or "My Project" (First letter capitalized):')
    }
    if (projectName) {
      Relay.Store.commitUpdate(
        new AddProjectMutation({
          projectName,
          customerId: this.props.viewer.user.id,
        }),
        {
          onSuccess: () => {
            tracker.track(ConsoleEvents.Project.created({name: projectName}))
            this.props.router.replace(`${projectName}`)
          },
        },
      )
    }
  }
}

const mapStateToProps = (state) => {
  return {
    gettingStartedState: state.gettingStarted.gettingStartedState,
    pollGettingStartedOnboarding: state.gettingStarted.poll,
    popup: state.popup,
  }
}

const mapDispatchToProps = (dispatch) => {
  return bindActionCreators({update}, dispatch)
}

const ReduxContainer = connect(
  mapStateToProps,
  mapDispatchToProps,
)(withRouter(ProjectRootView))

const MappedProjectRootView = mapProps({
  params: (props) => props.params,
  relay: (props) => props.relay,
  project: (props) => props.viewer.user ? props.viewer.project : null,
  allProjects: (props) => (
    props.viewer.user
      ? props.viewer.user.projects.edges.map((edge) => edge.node)
      : null
  ),
  viewer: (props) => props.viewer,
  user: (props) => props.viewer.user,
  isLoggedin: (props) => props.viewer.user !== null,
})(ReduxContainer)

export default Relay.createContainer(MappedProjectRootView, {
  initialVariables: {
    projectName: null, // injected from router
  },
  fragments: {
    viewer: () => Relay.QL`
      fragment on Viewer {
        id
        project: projectByName(projectName: $projectName) {
          id
          name
          ${SideNav.getFragment('project')}
        }
        user {
          id
          crm {
            onboardingStatus {
              gettingStarted
              gettingStartedSkipped
            }
            information {
              name
              email
            }
          }
          projects(first: 100) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
        ${SideNav.getFragment('viewer')}
      }
    `,
  },
})
